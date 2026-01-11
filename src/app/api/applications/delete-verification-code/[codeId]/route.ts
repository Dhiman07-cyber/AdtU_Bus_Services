import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { codeId: string } }
) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const { codeId } = params;

    if (!codeId) {
      return NextResponse.json({ error: 'Code ID is required' }, { status: 400 });
    }

    // Get the verification code document
    const codeRef = adminDb.collection('verificationCodes').doc(codeId);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) {
      return NextResponse.json({ error: 'Verification code not found' }, { status: 404 });
    }

    const codeData = codeDoc.data();

    // Verify the user owns this code
    if (codeData?.studentUid !== uid) {
      return NextResponse.json({ error: 'Unauthorized to delete this code' }, { status: 403 });
    }

    // Delete the verification code
    await codeRef.delete();

    // Also delete related notification if it exists
    const notificationsQuery = await adminDb.collection('notifications')
      .where('links.verificationCodeId', '==', codeId)
      .get();

    const batch = adminDb.batch();
    notificationsQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    if (!notificationsQuery.empty) {
      await batch.commit();
    }

    console.log(`🗑️ Deleted verification code ${codeId} and related notifications`);

    return NextResponse.json({ 
      success: true, 
      message: 'Verification code deleted successfully',
      codeId: codeId
    });

  } catch (error: any) {
    console.error('Error deleting verification code:', error);
    return NextResponse.json({ 
      error: 'Failed to delete verification code',
      details: error.message 
    }, { status: 500 });
  }
}





























