import { NextRequest, NextResponse } from 'next/server';
import { deleteExpiredNotifications } from '@/lib/notification-expiry';

/**
 * Cron endpoint for notification cleanup
 * Should be called daily at midnight (00:00 UTC)
 * 
 * Schedule in vercel.json:
 * "schedule": "0 0 * * *"  // Every day at 00:00 UTC
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (in production)
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Running notification cleanup cron job...');

    const result = await deleteExpiredNotifications();

    return NextResponse.json({
      success: true,
      message: 'Notification cleanup completed',
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

