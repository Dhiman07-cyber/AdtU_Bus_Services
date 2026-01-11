import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { deleteUserAndData } from '@/lib/cleanup-helpers';

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const actorUid = decodedToken.uid;

    // Verify user is admin or moderator
    const adminDoc = await adminDb.collection('admins').doc(actorUid).get();
    const modDoc = await adminDb.collection('moderators').doc(actorUid).get();
    
    if (!adminDoc.exists && !modDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, userType } = body;

    if (!userId || !userType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['student', 'driver', 'moderator'].includes(userType)) {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 400 });
    }

    // Prevent moderators from deleting admins or other moderators
    if (modDoc.exists && userType === 'moderator') {
      return NextResponse.json({ 
        error: 'Moderators cannot delete other moderators' 
      }, { status: 403 });
    }

    // Delete user and all associated data
    const result = await deleteUserAndData(userId, userType);

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to delete user' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${userType} deleted successfully`
    });
  } catch (error: any) {
    console.error('Error in delete user API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}

