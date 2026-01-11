import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle test token for development
    if (token === 'test') {
      console.log('🔧 Using test token for development');
    } else {
      const decodedToken = await adminAuth.verifyIdToken(token);
      const uid = decodedToken.uid;
    }

    // Verify user is admin or moderator (skip for test mode)
    if (token !== 'test') {
      const adminDoc = await adminDb.collection('admins').doc(uid).get();
      const modDoc = await adminDb.collection('moderators').doc(uid).get();
      
      if (!adminDoc.exists && !modDoc.exists) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    } else {
      console.log('🔧 Skipping admin/moderator check for test mode');
    }

    // Get all applications from applications collection, ordered by most recent
    const applicationsQuery = await adminDb.collection('applications')
      .orderBy('submittedAt', 'desc')
      .get();

    const applications = applicationsQuery.docs.map(doc => ({
      ...doc.data(),
      applicationId: doc.data().applicationId || doc.id // Use applicationId field or fallback to doc.id
    }));

    return NextResponse.json({
      applications
    });
  } catch (error: any) {
    console.error('Error fetching applications:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}

