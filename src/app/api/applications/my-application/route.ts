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

    // Get user's latest application
    const applicationsQuery = await adminDb.collection('applications')
      .where('applicantUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (applicationsQuery.empty) {
      return NextResponse.json({
        application: null
      });
    }

    const appDoc = applicationsQuery.docs[0];
    const appData = appDoc.data();

    return NextResponse.json({
      application: appData
    });
  } catch (error: any) {
    console.error('Error fetching application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch application' },
      { status: 500 }
    );
  }
}

