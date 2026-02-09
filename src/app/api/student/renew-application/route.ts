/**
 * API Route: Student Renewal Application (Offline Payment)
 * POST /api/student/renew-application
 * 
 * Creates a renewal application for offline payment processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCurrentBusFee } from '@/lib/bus-fee-service';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Parse request body
    const body = await request.json();
    const { studentId, duration, paymentMode, sessionInfo: clientSessionInfo } = body;

    // Validate student ID matches token
    if (studentId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Student ID mismatch' },
        { status: 403 }
      );
    }

    // Get student document
    const studentRef = adminDb.collection('students').doc(studentId);
    const studentDoc = await studentRef.get();

    if (!studentDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Student not found' },
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
        {
          success: false,
          error: 'You already have a pending renewal application'
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------------
    // AUTHORITATIVE CALCULATION (Source of Truth)
    // -----------------------------------------------------

    // 1. Fetch Fee
    const busFeeData = await getCurrentBusFee();
    const currentBusFee = busFeeData.amount;
    const calculatedFee = currentBusFee * duration;

    // 2. Fetch Deadline Config for Date Calculation
    const deadlineConfig = await getDeadlineConfig();

    // 3. Calculate Valid Until
    // Use student's current validUntil as base
    const currentValidUntil = studentData.validUntil;
    // Handle Firestore Timestamp or String
    let currentValidUntilStr: string | null = null;
    if (currentValidUntil) {
      if (typeof currentValidUntil === 'string') currentValidUntilStr = currentValidUntil;
      else if (currentValidUntil.toDate) currentValidUntilStr = currentValidUntil.toDate().toISOString();
    }

    const renewalResult = calculateRenewalDate(currentValidUntilStr, duration, deadlineConfig);
    const newValidUntil = renewalResult.newValidUntil;

    // Calculate session years based on newValidUntil
    const newValidUntilDate = new Date(newValidUntil);
    const sessionEndYear = newValidUntilDate.getFullYear();
    // Start year is typically duration years back? 
    // Or just sessionEndYear - duration? 
    // Actually, usually academic session is defined by end year.
    // Let's assume start year is relative to current validity or now.
    // For simplicity, we can trust client's start year OR derive it.
    // Let's try to derive it: 
    // If renewing for 1 year, session is (end-1) to end.
    // But `sessionInfo` usually displays e.g. "2025-2026".
    // Let's just store the validUntil which is the most critical part. 
    // We can populate sessionStart/End for display.
    const derivedSessionEndYear = sessionEndYear;
    const derivedSessionStartYear = derivedSessionEndYear - duration; // Rough approximation

    console.log(`📝 Creating renewal application for ${studentId}: Fee=${calculatedFee}, ValidUntil=${newValidUntil}`);

    // Create renewal application
    const renewalApplication = {
      studentId,
      studentName: studentData.fullName || studentData.name,
      enrollmentId: studentData.enrollmentId,
      email: studentData.email,
      phoneNumber: studentData.phoneNumber,
      currentValidUntil: studentData.validUntil,
      requestedDuration: duration,
      sessionInfo: {
        // Use authoritative values primarily
        sessionStartYear: derivedSessionStartYear,
        sessionEndYear: derivedSessionEndYear,
        validUntil: newValidUntil,
        fee: calculatedFee,
      },
      paymentMode: paymentMode || 'offline',
      paymentStatus: 'pending',
      applicationStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const applicationRef = await adminDb
      .collection('renewal_applications')
      .add(renewalApplication);

    // ... Update student doc ... (unchanged logic below)



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

  } catch (error: any) {
    console.error('❌ Error creating renewal application:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to submit renewal application',
      },
      { status: 500 }
    );
  }
}
