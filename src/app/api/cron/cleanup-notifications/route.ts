import { NextRequest, NextResponse } from 'next/server';
import { deleteExpiredNotifications } from '@/lib/notification-expiry';

/**
 * Cron endpoint for notification cleanup
 * Should be called WEEKLY on Sundays at 3:00 AM IST (22:30 UTC Saturday)
 * 
 * Schedule in vercel.json:
 * "schedule": "30 22 * * 6"  (Every Saturday at 22:30 UTC = Sunday 3:00 AM IST)
 * 
 * OR for every 7 days:
 * "schedule": "0 3 *\/7 * *"  (Every 7 days at 03:00 UTC)
 * 
 * Actions:
 * - Deletes all notifications where expiresAt < now
 * - Deletes associated read receipts
 * - Uses batch operations for efficiency
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (in production)
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🕐 [CRON] Starting weekly notification cleanup...');
    const startTime = Date.now();

    const result = await deleteExpiredNotifications();

    const duration = Date.now() - startTime;
    console.log(`🎉 [CRON] Cleanup completed in ${duration}ms`);
    console.log(`   Deleted: ${result.deletedNotifications} notifications, ${result.deletedReceipts} receipts`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      message: `Cleaned up ${result.deletedNotifications} expired notifications and ${result.deletedReceipts} receipts`,
      result
    });
  } catch (error: any) {
    console.error('❌ Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `${error.message} (Project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID})`
      },
      { status: 500 }
    );
  }
}

/**
 * Manual trigger endpoint (for testing or admin use)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { adminAuth, adminDb } = await import('@/lib/firebase-admin');
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Verify user is admin
    const adminDoc = await adminDb.collection('admins').doc(decodedToken.uid).get();

    if (!adminDoc.exists) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('🔄 Manual notification cleanup triggered by admin:', decodedToken.uid);

    const result = await deleteExpiredNotifications();

    return NextResponse.json({
      success: true,
      message: 'Manual notification cleanup completed',
      result
    });
  } catch (error: any) {
    console.error('❌ Manual trigger error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `${error.message || 'Manual trigger failed'} (Project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID})`
      },
      { status: 500 }
    );
  }
}

