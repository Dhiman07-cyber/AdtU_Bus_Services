import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { notifyRoute, verifyDriverRouteBinding } from '@/lib/services/fcm-notification-service';
import { withSecurity } from '@/lib/security/api-security';
import { NotifyStudentsSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/driver/notify-students
 * 
 * Sends FCM push notifications to all students assigned to a bus/route
 * when the driver starts a trip.
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const { busId, routeId, tripId } = body as any;
    const driverUid = auth.uid;

    // Verify driver→bus→route binding
    const authCheck = await verifyDriverRouteBinding(driverUid, routeId, busId);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { error: authCheck.reason || 'Driver not authorized' },
        { status: 403 }
      );
    }

    // Get route name for notification message
    let routeName = 'your route';
    try {
      const routeDoc = await adminDb.collection('routes').doc(routeId).get();
      if (routeDoc.exists) {
        const routeData = routeDoc.data();
        routeName = routeData?.name || routeData?.routeName || 'your route';
      }
    } catch (e) {
      console.warn('Could not fetch route name:', e);
    }

    // Send notifications via centralized service
    const result = await notifyRoute({
      routeId,
      tripId,
      routeName,
      busId,
    });

    return NextResponse.json({
      success: true,
      message: result.error === 'already_sent'
        ? 'Notification already sent for this trip'
        : 'Students notified successfully',
      notifiedCount: result.successCount,
      failedCount: result.failureCount,
      totalTokens: result.totalTokens,
      batchCount: result.batchCount,
      invalidTokensRemoved: result.invalidTokensRemoved,
    });
  },
  {
    requiredRoles: ['driver'],
    schema: NotifyStudentsSchema,
    rateLimit: RateLimits.NOTIFICATION_CREATE,
    allowBodyToken: true
  }
);
