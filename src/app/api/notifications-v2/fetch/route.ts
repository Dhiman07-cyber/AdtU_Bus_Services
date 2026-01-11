/**
 * GET /api/notifications-v2/fetch
 * Fetch notifications with role-based visibility filtering
 * Implements pagination and proper filtering based on user role and permissions
 */

import { headers } from 'next/headers';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { cert } from 'firebase-admin/app';
import { UserRole } from '@/lib/notifications/types';
import { filterNotificationsForUser, sortNotifications } from '@/lib/notifications/visibility-resolver';

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

export async function GET(request: Request) {
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

    // Parse query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeRead = url.searchParams.get('includeRead') === 'true';

    // Build user context
    const userContext = {
      userId: decodedToken.uid,
      userRole: userRole,
      routeId: userData.routeId,
    };

    // Fetch notifications where user is a recipient
    const notificationsRef = db.collection('notifications_v2');
    let query = notificationsRef
      .where('recipients', 'array-contains', { userId: decodedToken.uid })
      .orderBy('metadata.createdAt', 'desc')
      .limit(limit + offset);

    const snapshot = await query.get();
    const allNotifications = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter using visibility resolver
    let filteredNotifications = filterNotificationsForUser(allNotifications, userContext);

    // Filter out locally hidden notifications
    filteredNotifications = filteredNotifications.filter(notif => {
      const recipientRecord = notif.recipients.find((r: any) => r.userId === decodedToken.uid);
      return recipientRecord && !recipientRecord.isHiddenForUser;
    });

    // Filter out read notifications if needed
    if (!includeRead) {
      filteredNotifications = filteredNotifications.filter(notif => {
        const recipientRecord = notif.recipients.find((r: any) => r.userId === decodedToken.uid);
        return recipientRecord && !recipientRecord.readAt;
      });
    }

    // Sort notifications
    const sortedNotifications = sortNotifications(filteredNotifications);

    // Apply pagination
    const paginatedNotifications = sortedNotifications.slice(offset, offset + limit);

    // Calculate unread count
    const unreadCount = filteredNotifications.filter(notif => {
      const recipientRecord = notif.recipients.find((r: any) => r.userId === decodedToken.uid);
      return recipientRecord && !recipientRecord.readAt;
    }).length;

    return Response.json({
      success: true,
      notifications: paginatedNotifications,
      unreadCount: unreadCount,
      total: filteredNotifications.length,
      hasMore: (offset + limit) < filteredNotifications.length,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return Response.json({
      success: false,
      error: error.message || 'Failed to fetch notifications',
    }, { status: 500 });
  }
}
