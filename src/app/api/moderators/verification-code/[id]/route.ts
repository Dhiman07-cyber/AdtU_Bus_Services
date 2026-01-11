import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const applicationId = params.id;

    // Find the verification code notification sent to this moderator for this application
    const notificationsQuery = await adminDb.collection('notifications')
      .where('toUid', '==', uid)
      .where('type', '==', 'VerificationRequested')
      .where('links.applicationId', '==', applicationId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (notificationsQuery.empty) {
      return NextResponse.json({ error: 'Verification code not found' }, { status: 404 });
    }

    const notificationData = notificationsQuery.docs[0].data();
    const code = notificationData.verificationCode;

    if (!code) {
      return NextResponse.json({ error: 'Code not available' }, { status: 404 });
    }

    return NextResponse.json({
      code
    });
  } catch (error: any) {
    console.error('Error fetching verification code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch code' },
      { status: 500 }
    );
  }
}

