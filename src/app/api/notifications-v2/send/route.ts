/**
 * POST /api/notifications-v2/send
 * Send notification with role-based permissions and auto-recipient injection
 */

import { headers } from 'next/headers';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { cert } from 'firebase-admin/app';
import {
  NotificationSender,
  NotificationTarget,
  UserRole
} from '@/lib/notifications/types';
import { canSend, validateTarget } from '@/lib/notifications/permissions';
import { resolveRecipients, buildRecipientRecords } from '@/lib/notifications/recipients-resolver';

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

export async function POST(request: Request) {
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

    // Verify token and get user
    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const senderRole = userData.role as UserRole;

    // Parse request body
    const body = await request.json();
    const { content, target } = body;

    // Validation
    if (!content || content.trim().length === 0) {
      return Response.json({ success: false, error: 'Content is required' }, { status: 400 });
    }

    if (!target || !target.type) {
      return Response.json({ success: false, error: 'Target is required' }, { status: 400 });
    }

    const notificationTarget: NotificationTarget = target;

    // Check send permission
    const sendPermission = canSend(senderRole, notificationTarget);
    if (!sendPermission.allowed) {
      return Response.json({
        success: false,
        error: sendPermission.reason
      }, { status: 403 });
    }

    // Validate target
    const targetValidation = validateTarget(senderRole, notificationTarget);
    if (!targetValidation.allowed) {
      return Response.json({
        success: false,
        error: targetValidation.reason
      }, { status: 400 });
    }

    // Build sender info - avoid undefined values for Firestore
    const employeeId = userData.employeeId || userData.staffId || userData.empId || null;
    const sender: NotificationSender = {
      userId: decodedToken.uid,
      userName: userData.name || userData.fullName || 'Unknown',
      userRole: senderRole,
      ...(employeeId && { employeeId }), // Only include if defined
    };

    // Fetch function for resolveRecipients
    const fetchUsers = async (query: any) => {
      let usersQuery = db.collection('users');

      if (query.role) {
        usersQuery = usersQuery.where('role', '==', query.role);
      }

      if (query.routeId?.in) {
        usersQuery = usersQuery.where('routeId', 'in', query.routeId.in);
      }

      const snapshot = await usersQuery.get();
      return snapshot.docs.map((doc: any) => ({
        uid: doc.id,
        role: doc.data().role,
        routeId: doc.data().routeId,
      }));
    };

    // Resolve all recipients (direct + auto-injected)
    const resolved = await resolveRecipients(sender, notificationTarget, fetchUsers);

    // Get full user data for all recipients
    const allRecipientIds = [...resolved.directRecipients, ...resolved.autoInjectedRecipients];

    if (allRecipientIds.length === 0) {
      return Response.json({
        success: false,
        error: 'No recipients found for this target'
      }, { status: 400 });
    }

    const userDataMap = new Map();
    for (const userId of allRecipientIds) {
      const userDocSnap = await db.collection('users').doc(userId).get();
      if (userDocSnap.exists) {
        const data = userDocSnap.data();
        userDataMap.set(userId, {
          role: data.role,
          routeId: data.routeId,
        });
      }
    }

    // Build recipient records
    const recipients = buildRecipientRecords(
      resolved.directRecipients,
      resolved.autoInjectedRecipients,
      userDataMap
    );

    // Create notification document
    const notificationData = {
      metadata: {
        content: content.trim(),
        sender: sender,
        target: notificationTarget,
        createdAt: Timestamp.now(),
        isEdited: false,
        isDeletedGlobally: false,
        editHistory: [],
      },
      recipients: recipients,
      autoInjectedRecipients: resolved.autoInjectedRecipients,
      // Store for analytics
      stats: {
        directRecipientCount: resolved.directRecipients.length,
        autoInjectedCount: resolved.autoInjectedRecipients.length,
        totalRecipients: recipients.length,
      },
    };

    // Save to Firestore
    const docRef = await db.collection('notifications_v2').add(notificationData);

    return Response.json({
      success: true,
      messageId: docRef.id,
      recipientCount: recipients.length,
      autoInjected: {
        admin: resolved.requiresAdminCopy,
        moderators: resolved.requiresModeratorsCopy,
        count: resolved.autoInjectedRecipients.length,
      },
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error sending notification:', error);
    return Response.json({
      success: false,
      error: error.message || 'Failed to send notification',
    }, { status: 500 });
  }
}
