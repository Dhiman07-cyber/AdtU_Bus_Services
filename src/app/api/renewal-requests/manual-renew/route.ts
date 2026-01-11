import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebase-admin';
import { getCurrentBusFee } from '@/lib/bus-fee-service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Verify admin or moderator and get detailed info
    const userDoc = await adminDb.collection('admins').doc(uid).get();
    const modDoc = await adminDb.collection('moderators').doc(uid).get();

    if (!userDoc.exists && !modDoc.exists) {
      return NextResponse.json({ error: 'Unauthorized - Admin or Moderator access required' }, { status: 403 });
    }

    const approverDoc = userDoc.exists ? userDoc : modDoc;
    const userData = approverDoc.data();
    const adminName = userData?.fullName || userData?.name || 'Admin';
    const approverRole = userDoc.exists ? 'admin' : 'moderator';
    const approverEmpId = userData?.empId || userData?.employeeId || 'N/A';
    const approverEmail = userData?.email || 'N/A';

    console.log('\n👤 MANUAL RENEWAL INITIATED BY:');
    console.log('Name:', adminName);
    console.log('Emp ID:', approverEmpId);
    console.log('Role:', approverRole);
    console.log('Email:', approverEmail);

    const body = await request.json();
    const { studentIds, durationYears } = body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'Student IDs required' }, { status: 400 });
    }

    if (!durationYears || ![1, 2, 3, 4].includes(durationYears)) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }

    // Fetch current bus fee from settings
    const busFeeData = await getCurrentBusFee();
    const baseFee = busFeeData.amount || 1200;
    const fee = baseFee * durationYears;

    let successCount = 0;
    const errors: string[] = [];

    // Process each student
    for (const studentId of studentIds) {
      try {
        const studentRef = adminDb.collection('students').doc(studentId);
        const studentDoc = await studentRef.get();

        if (!studentDoc.exists) {
          errors.push(`Student ${studentId} not found`);
          continue;
        }

        const studentData = studentDoc.data();
        if (!studentData) {
          errors.push(`Invalid student data for ${studentId}`);
          continue;
        }

        console.log('\n📋 MANUAL RENEWAL - Processing:', studentId);
        console.log('Requested duration:', durationYears, 'years');

        // Get existing values
        const existingSessionStartYear = studentData.sessionStartYear || new Date().getFullYear();
        const existingSessionEndYear = studentData.sessionEndYear || new Date().getFullYear();
        const existingDurationYears = studentData.durationYears || 0;
        const existingValidUntil = studentData.validUntil;

        console.log('Current session:', existingSessionStartYear, '-', existingSessionEndYear);
        console.log('Current validUntil:', existingValidUntil);
        console.log('Current durationYears:', existingDurationYears);

        // Calculate base year for new validity
        let baseYear = new Date().getFullYear();
        const now = new Date();

        if (existingValidUntil) {
          // Check if existing validity is still valid
          const existingDate = typeof existingValidUntil === 'string'
            ? new Date(existingValidUntil)
            : existingValidUntil.toDate ? existingValidUntil.toDate() : existingValidUntil;

          console.log('Service expires:', existingDate.toISOString());
          console.log('Is still valid?', existingDate > now);

          if (existingDate > now) {
            // ✅ Still valid, extend from existing SESSION END YEAR (not validUntil year)
            baseYear = existingSessionEndYear;
            console.log('✅ Extending from sessionEndYear:', baseYear);
          } else {
            console.log('⚠️ Service expired - starting fresh from:', baseYear);
          }
        } else {
          console.log('ℹ️ No existing validity - starting from:', baseYear);
        }

        // Calculate new validity date using same function as payment webhook
        const newValidUntil = calculateValidUntilDate(baseYear, durationYears);
        const newSessionEndYear = baseYear + durationYears;

        // Calculate cumulative duration (existing + new)
        const totalDurationYears = existingDurationYears + durationYears;

        console.log('\n✨ NEW VALUES:');
        console.log('New validUntil:', newValidUntil.toISOString());
        console.log('New session:', existingSessionStartYear, '-', newSessionEndYear);
        console.log('Total durationYears:', totalDurationYears, '(cumulative)');

        console.log('\n💾 Updating Firestore...');

        // Update student document with ALL required fields (matches webhook/approval)
        await studentRef.update({
          // Core renewal fields
          validUntil: newValidUntil,
          status: 'active', // Always set to active (even if was expired)
          sessionStartYear: existingSessionStartYear, // Keep original start year
          sessionEndYear: newSessionEndYear, // Based on new validity
          durationYears: totalDurationYears, // Cumulative duration

          // Payment tracking fields
          paymentAmount: fee,
          lastRenewalDate: FieldValue.serverTimestamp(),

          // Metadata
          updatedAt: FieldValue.serverTimestamp()
        });

        // Generate payment ID for manual renewal with timestamp
        const renewalTimestamp = Date.now();
        const paymentId = `manual_${renewalTimestamp}_${uuidv4().substring(0, 8)}`;

        // Save transaction record with FULL audit trail (matches offline approval)
        const transactionRecord = {
          // Student Information
          studentId: studentData.enrollmentId || studentId,
          studentName: studentData.fullName || 'Unknown',
          studentEmail: studentData.email || 'N/A',
          studentPhone: studentData.phoneNumber || 'N/A',

          // Payment Details
          amount: fee,
          paymentMethod: 'manual' as const,
          paymentId,
          durationYears,
          userId: studentId, // Firestore document ID

          // Validity Information (validUntil required for compatibility)
          validUntil: newValidUntil.toISOString(), // Required field
          previousValidUntil: existingValidUntil ? (typeof existingValidUntil === 'string' ? existingValidUntil : existingValidUntil.toDate ? existingValidUntil.toDate().toISOString() : new Date(existingValidUntil).toISOString()) : null,
          newValidUntil: newValidUntil.toISOString(),
          previousSessionEndYear: existingSessionEndYear,
          newSessionEndYear,
          previousDurationYears: existingDurationYears,
          newDurationYears: totalDurationYears,

          // Approval Information (DETAILED for fraud prevention)
          approvedBy: {
            name: adminName,
            empId: approverEmpId,
            userId: uid,
            email: approverEmail,
            role: approverRole as 'admin' | 'moderator'
          },
          approvedByDisplay: `${adminName} (${approverEmpId})`, // For easy display

          // Request Tracking (no request for manual renewals)
          renewalRequestId: undefined,
          requestSubmittedAt: undefined,

          // Timestamps (Multiple for verification)
          timestamp: new Date().toISOString(),
          timestampMs: renewalTimestamp,
          approvedAtISO: new Date(renewalTimestamp).toISOString(),

          // Status
          status: 'completed' as const,

          // Metadata for audit
          metadata: {
            source: 'manual_renewal' as const,
            calculationMethod: 'recalculated_at_manual_renewal',
            baseYear,
            wasServiceActive: existingValidUntil ? (typeof existingValidUntil === 'string' ? new Date(existingValidUntil) : existingValidUntil.toDate ? existingValidUntil.toDate() : existingValidUntil) > new Date() : false,
            systemVersion: '1.0',
            processedAt: new Date().toISOString(),
            studentCount: studentIds.length,
            batchProcessing: studentIds.length > 1
          }
        };

        await PaymentTransactionService.saveTransaction(transactionRecord);
        console.log('✅ Transaction saved for:', studentId);

        // Activity tracking via JSON transaction file (no Firestore activity_logs)
        // All audit data including approver details is in transaction JSON

        successCount++;
      } catch (error) {
        console.error(`Error renewing student ${studentId}:`, error);
        errors.push(`Failed to renew ${studentId}`);
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      total: studentIds.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in manual renewal:', error);
    return NextResponse.json(
      { error: 'Failed to process manual renewal' },
      { status: 500 }
    );
  }
}
