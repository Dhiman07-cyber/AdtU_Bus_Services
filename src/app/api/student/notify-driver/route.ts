import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { NotifyDriverSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/student/notify-driver
 * 
 * Logic to notify a driver (FCM or other) when a student sends a request.
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const { busId, studentName } = body as any;
    const studentUid = auth.uid;

    console.log('🔔 Student notifying driver:', { studentUid, busId, studentName });

    // Find the driver assigned to this bus
    let driversSnapshot = await adminDb
      .collection('drivers')
      .where('assignedBusId', '==', busId)
      .limit(1)
      .get();

    if (driversSnapshot.empty) {
      // Try alternative field name
      driversSnapshot = await adminDb
        .collection('drivers')
        .where('busId', '==', busId)
        .limit(1)
        .get();

      if (driversSnapshot.empty) {
        console.warn('⚠️ No driver found for bus:', busId);
        return NextResponse.json({
          success: false,
          message: 'No driver found for this bus'
        });
      }
    }

    const drivers = driversSnapshot.docs;
    console.log(`📱 Found ${drivers.length} driver(s) for bus ${busId}`);

    // Note: FCM notification to driver would go here
    // For now, we're using Supabase broadcast which is already handled client-side

    return NextResponse.json({
      success: true,
      message: 'Driver notification queued',
      driversNotified: drivers.length
    });
  },
  {
    requiredRoles: ['student'],
    schema: NotifyDriverSchema,
    rateLimit: RateLimits.NOTIFICATION_CREATE,
    allowBodyToken: true
  }
);







