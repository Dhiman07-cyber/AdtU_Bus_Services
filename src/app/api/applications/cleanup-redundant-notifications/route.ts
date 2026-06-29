import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
  async (request, { auth, requestId }) => {
    try {
      // Find all notifications with redundant applicationDetails
      const notificationsQuery = await adminDb.collection('notifications')
        .where('type', '==', 'VerificationRequested')
        .limit(400)
        .get();

      if (notificationsQuery.empty) {
        return NextResponse.json({
          success: true,
          message: 'No redundant notifications found',
          cleanedCount: 0
        });
      }

      // Update notifications to remove redundant data
      const batch = adminDb.batch();
      let updatedCount = 0;

      notificationsQuery.docs.forEach((doc) => {
        const data = doc.data();

        // Check if notification has redundant applicationDetails
        if (data.applicationDetails) {
          // Remove applicationDetails but keep other fields
          const { applicationDetails, ...cleanData } = data;
          batch.update(doc.ref, cleanData);
          updatedCount++;
          console.log(`🧹 Removed redundant applicationDetails from notification: ${doc.id}`);
        }
      });

      // Commit the batch update
      if (updatedCount > 0) {
        await batch.commit();
      }

      console.log(`🧹 Cleaned up ${updatedCount} notifications with redundant data`);

      return NextResponse.json({
        success: true,
        message: `Cleaned up ${updatedCount} notifications with redundant data`,
        cleanedCount: updatedCount
      });

    } catch (error: any) {
      console.error('Error cleaning up redundant notifications:', error);
      return NextResponse.json({
        error: 'Failed to cleanup redundant notifications',
        details: 'Internal error'
      }, { status: 500 });
    }
  },
  {
    requiredRoles: ['admin'],
    schema: EmptySchema,
    rateLimit: RateLimits.CREATE,
  }
);
