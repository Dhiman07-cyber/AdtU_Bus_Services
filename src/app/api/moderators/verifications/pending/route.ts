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

    // Verify user is a moderator
    const modDoc = await adminDb.collection('moderators').doc(uid).get();
    if (!modDoc.exists) {
      return NextResponse.json({ error: 'Not a moderator' }, { status: 403 });
    }

    const modData = modDoc.data();
    const moderatorName = `${modData?.name} ${modData?.empId}`;

    // Get all applications awaiting verification assigned to this moderator
    const applicationsQuery = await adminDb.collection('applications')
      .where('state', '==', 'awaiting_verification')
      .where('pendingVerifier', '==', moderatorName)
      .orderBy('updatedAt', 'desc')
      .get();

    const verifications = applicationsQuery.docs.map(doc => doc.data());

    return NextResponse.json({
      verifications
    });
  } catch (error: any) {
    console.error('Error fetching verifications:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch verifications' },
      { status: 500 }
    );
  }
}

