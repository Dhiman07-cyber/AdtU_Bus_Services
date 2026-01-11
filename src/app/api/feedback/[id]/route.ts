import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { readFeedback, deleteFeedback } from '@/lib/feedback-utils';

/**
 * DELETE /api/feedback/:id
 * Delete feedback entry (admin & moderator only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params before accessing its properties (Next.js 15 requirement)
    const { id: feedbackId } = await params;

    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Get user role from Firestore
    const { db } = await import('@/lib/firebase-admin');
    const adminDoc = await db.collection('admins').doc(userId).get();
    const moderatorDoc = await db.collection('moderators').doc(userId).get();

    // Only Admin can delete feedback
    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Read feedback to get the entry data for logging
    const entries = await readFeedback();
    const entryToDelete = entries.find(entry => entry.id === feedbackId);

    if (!entryToDelete) {
      return NextResponse.json(
        { error: 'Feedback not found' },
        { status: 404 }
      );
    }

    // Delete the entry directly from Firestore
    await deleteFeedback(feedbackId);

    // Log action
    console.log('🗑️ Feedback deleted:', {
      id: feedbackId,
      deleted_by: userId,
      deleted_entry: {
        user_id: entryToDelete.user_id,
        role: entryToDelete.role
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Feedback deleted successfully',
      deleted: entryToDelete
    });

  } catch (error: any) {
    console.error('❌ Error deleting feedback:', error);
    return NextResponse.json(
      { error: 'Failed to delete feedback' },
      { status: 500 }
    );
  }
}



