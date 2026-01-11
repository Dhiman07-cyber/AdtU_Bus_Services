/**
 * API Route: Student Renewal Application (Offline Payment)
 * POST /api/student/renew-application
 * 
 * Creates a renewal application for offline payment processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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
    const { studentId, duration, paymentMode, sessionInfo } = body;

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

    const studentData = studentDoc.data();

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
        sessionStartYear: sessionInfo.sessionStartYear,
        sessionEndYear: sessionInfo.sessionEndYear,
        validUntil: sessionInfo.validUntil,
        fee: sessionInfo.fee,
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
        requestedValidUntil: sessionInfo.validUntil,
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
        sessionInfo,
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
