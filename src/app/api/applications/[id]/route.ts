import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Verify user is admin or moderator
    const moderatorDoc = await adminDb.collection('moderators').doc(uid).get();
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    
    if (!moderatorDoc.exists && !adminDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Await params before accessing its properties (Next.js 15 requirement)
    const { id: applicationId } = await params;

    // Get application from applications collection
    const applicationDoc = await adminDb.collection('applications').doc(applicationId).get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const applicationData = applicationDoc.data();

    return NextResponse.json({
      success: true,
      application: {
        ...applicationData,
        applicationId: applicationData.applicationId || applicationId
      }
    });
  } catch (error: any) {
    console.error('Error fetching application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch application' },
      { status: 500 }
    );
  }
}