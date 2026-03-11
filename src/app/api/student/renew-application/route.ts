import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCurrentBusFee } from '@/lib/bus-fee-service';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { withSecurity } from '@/lib/security/api-security';
import { RenewApplicationSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/student/renew-application
 * 
 * Creates a renewal application for offline payment processing.
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const { studentId, duration, paymentMode } = body as any;
    const userId = auth.uid;

    // Validate student ID matches token
    if (studentId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: Student ID mismatch' },
        { status: 403 }
      );
    }

    // Get student document
    const studentRef = adminDb.collection('students').doc(studentId);
    const studentDoc = await studentRef.get();

    if (!studentDoc.exists) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    const studentData = studentDoc.data()!;

    // Check if there's already a pending renewal application
    const existingApplications = await adminDb
      .collection('renewal_applications')
      .where('studentId', '==', studentId)
      .where('status', '==', 'pending')
      .get();

    if (!existingApplications.empty) {
      return NextResponse.json(
        { error: 'You already have a pending renewal application' },
        { status: 400 }
      );
    }

    // 1. Fetch Authoritative Fee
    const busFeeData = await getCurrentBusFee();
    const currentBusFee = busFeeData.amount;
    const calculatedFee = currentBusFee * duration;

    // 2. Fetch Deadline Config for Date Calculation
    const deadlineConfig = await getDeadlineConfig();

    // 3. Calculate Valid Until
    const currentValidUntil = studentData.validUntil;
    let currentValidUntilStr: string | null = null;
    if (currentValidUntil) {
      if (typeof currentValidUntil === 'string') currentValidUntilStr = currentValidUntil;
      else if (currentValidUntil.toDate) currentValidUntilStr = currentValidUntil.toDate().toISOString();
    }

    const renewalResult = calculateRenewalDate(currentValidUntilStr, duration, deadlineConfig);
    const newValidUntil = renewalResult.newValidUntil;

    // 4. Derive Session Years
    const newValidUntilDate = new Date(newValidUntil);
    const derivedSessionEndYear = newValidUntilDate.getFullYear();
    const derivedSessionStartYear = derivedSessionEndYear - duration; 

    console.log(`📝 Creating renewal application for ${studentId}: Fee=${calculatedFee}, ValidUntil=${newValidUntil}`);

    // Create renewal application record
    const renewalApplication = {
      studentId,
      studentName: studentData.fullName || studentData.name,
      enrollmentId: studentData.enrollmentId,
      email: studentData.email,
      phoneNumber: studentData.phoneNumber,
      currentValidUntil: studentData.validUntil,
      requestedDuration: duration,
      sessionInfo: {
        sessionStartYear: derivedSessionStartYear,
        sessionEndYear: derivedSessionEndYear,
        validUntil: newValidUntil,
        fee: calculatedFee,
      },
      paymentMode: paymentMode || 'offline',
      paymentStatus: 'pending',
      applicationStatus: 'pending',
      status: 'pending', // Added for consistency with queries
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const applicationRef = await adminDb
      .collection('renewal_applications')
      .add(renewalApplication);

    // Update student document to indicate pending renewal
    await studentRef.update({
      hasRenewalPending: true,
      renewalApplicationId: applicationRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log activity
    await adminDb.collection('activity_logs').add({
      type: 'renewal_application',
      userId: studentId,
      userName: studentData.fullName || studentData.name,
      action: 'Renewal application submitted',
      details: {
        applicationId: applicationRef.id,
        duration: duration,
        paymentMode: paymentMode,
        requestedValidUntil: renewalApplication.sessionInfo.validUntil,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Renewal application created for student ${studentId}`);

    return NextResponse.json({
      success: true,
      message: 'Renewal application submitted successfully',
      data: {
        applicationId: applicationRef.id,
        studentId,
        duration,
        sessionInfo: renewalApplication.sessionInfo,
        paymentMode,
      },
    });
  },
  {
    requiredRoles: ['student'],
    schema: RenewApplicationSchema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true
  }
);
