import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Check if user exists in "users" collection (approved)
    const userDoc = await adminDb.collection('users').doc(uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      return NextResponse.json({
        success: true,
        status: 'approved',
        message: 'Your application has been approved!',
        userData: userData
      });
    }

    // Check if application exists in applications collection
    const applicationDoc = await adminDb.collection('applications').doc(uid).get();

    if (applicationDoc.exists) {
      const applicationData = applicationDoc.data();

      if (applicationData?.state === 'rejected') {
        return NextResponse.json({
          success: true,
          status: 'rejected',
          message: 'Your application has been rejected',
          rejectionReason: applicationData.rejectionReason,
          rejectedBy: applicationData.rejectedBy,
          rejectedAt: applicationData.rejectedAt,
          applicationData: applicationData
        });
      }

      if (applicationData?.state === 'approved') {
        return NextResponse.json({
          success: true,
          status: 'approved',
          message: 'Your application has been approved!',
          applicationData: applicationData
        });
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
        message: 'Form submitted and verified! Waiting for approval from the Managing Team',
        submittedAt: applicationData.submittedAt,
        applicationData: applicationData
      });
    }

    // No application found
    return NextResponse.json({
      success: true,
      status: 'no_application',
      message: 'No application found'
    });

  } catch (error: any) {
    console.error('Error checking application status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check application status' },
      { status: 500 }
    );
  }
}
