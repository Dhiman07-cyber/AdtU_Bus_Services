/**
 * DELETE /api/notifications-v2/delete-global
 * Delete notification for everyone
 * Only allowed for: Admin (any message) or Moderator (own messages only)
 */

import { headers } from 'next/headers';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { cert } from 'firebase-admin/app';
import { UserRole } from '@/lib/notifications/types';
import { deleteForEveryone } from '@/lib/notifications/delete-handler';

// Firebase Admin initialization
let adminApp: any;
let auth: any;
let db: any;
let useAdminSDK = false;

try {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\n').replace(/"/g, '');
      adminApp = initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      adminApp = getApps()[0];
    }
    auth = getAuth(adminApp);
    db = getFirestore(adminApp);
    useAdminSDK = true;
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK:', error);
  useAdminSDK = false;
}

export async function DELETE(request: Request) {
  try {
    // Verify authentication
    const authHeader = (await headers()).get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    if (!useAdminSDK || !auth || !db) {
      return Response.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    // Verify token
    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const userRole = userData.role as UserRole;

    // Parse request body
    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return Response.json({ success: false, error: 'Notification ID required' }, { status: 400 });
    }

    // Get notification
    const notifRef = db.collection('notifications_v2').doc(notificationId);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return Response.json({ success: false, error: 'Notification not found' }, { status: 404 });
    }

    const notifData = notifDoc.data();
    const senderId = notifData.metadata.sender.userId;
    const recipients = notifData.recipients || [];

    // Update function for delete handler
    const updateFunction = async (id: string, deletedBy: string) => {
      // Get user who deleted it for display
      const deleterDoc = await db.collection('users').doc(deletedBy).get();
      const deleterName = deleterDoc.exists 
        ? deleterDoc.data().name || deleterDoc.data().fullName 
        : 'Unknown';

      await notifRef.update({
        'metadata.isDeletedGlobally': true,
        'metadata.deletedByUserId': deletedBy,
        'metadata.deletedByName': deleterName,
        'metadata.deletedAt': Timestamp.now(),
        'metadata.content': '🚫 This message was deleted',
      });
      
      // Return affected user IDs
      return recipients.map((r: any) => r.userId);
    };

    // Execute global delete
    const result = await deleteForEveryone(
      notificationId,
      decodedToken.uid,
      userRole,
      senderId,
      updateFunction
    );

    if (!result.success) {
      return Response.json({ 
        success: false, 
        error: result.error 
      }, { status: 403 });
    }

    return Response.json({
      success: true,
      operation: 'global',
      affectedUsers: result.affectedUsers?.length || 0,
      message: 'Notification deleted for everyone',
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error deleting notification globally:', error);
    return Response.json({
      success: false,
      error: error.message || 'Failed to delete notification',
    }, { status: 500 });
  }
}
