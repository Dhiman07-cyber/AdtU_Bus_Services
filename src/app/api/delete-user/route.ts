import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { deleteUserAndData } from '@/lib/cleanup-helpers';

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { uid } = body;

    if (!uid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Extract token from Authorization header or body (backward compat)
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : body.idToken;

    if (!idToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!adminAuth || !adminDb) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin SDK not available'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller's token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const callerUid = decodedToken.uid;

    // Check if the caller is an admin — use the `admins` collection as the
    // authoritative source (not the `users` collection whose `role` field could
    // be stale or tampered with by a client SDK write).
    const callerAdminDoc = await adminDb.collection('admins').doc(callerUid).get();
    if (!callerAdminDoc.exists) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized: Only admins can delete users'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the target user to determine type and prevent admin deletion
    const targetDoc = await adminDb.collection('users').doc(uid).get();
    if (!targetDoc.exists) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targetData = targetDoc.data();
    if (targetData.role === 'admin') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Cannot delete admin users'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userType = targetData.role as 'student' | 'driver' | 'moderator';
    const result = await deleteUserAndData(uid, userType);

    if (!result.success) {
      return new Response(JSON.stringify({
        success: false,
        error: result.error || 'Failed to delete user'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'User and all associated data deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to delete user'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
