import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      console.warn('⚠️ Cleanup attempt without auth token');
      return NextResponse.json({ 
        error: 'Unauthorized',
        message: 'Authentication token is required'
      }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (authError: any) {
      console.error('❌ Token verification failed:', authError.message);
      return NextResponse.json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired authentication token',
        details: authError.message
      }, { status: 401 });
    }
    
    const uid = decodedToken.uid;

    // Get current time
    const now = new Date().toISOString();

    // Find all expired verification codes
    const expiredCodesQuery = await adminDb.collection('verificationCodes')
      .where('expiresAt', '<', now)
      .get();

    if (expiredCodesQuery.empty) {
      return NextResponse.json({ 
        success: true, 
        message: 'No expired codes found',
        cleanedCount: 0
      });
    }

    // Delete expired codes and related notifications in batches
    const batch = adminDb.batch();
    let deletedCount = 0;
    const expiredCodeIds: string[] = [];

    // Collect expired code IDs and delete verification codes
    expiredCodesQuery.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
      expiredCodeIds.push(doc.id);
      deletedCount++;
    });

    // Find and delete related notifications for expired codes
    if (expiredCodeIds.length > 0) {
      // Handle Firestore 'in' query limit (max 10 items)
      const batchSize = 10;
      for (let i = 0; i < expiredCodeIds.length; i += batchSize) {
        const batchIds = expiredCodeIds.slice(i, i + batchSize);
        const notificationsQuery = await adminDb.collection('notifications')
          .where('links.verificationCodeId', 'in', batchIds)
          .get();

        notificationsQuery.docs.forEach((doc: any) => {
          batch.delete(doc.ref);
          console.log(`🗑️ Deleting notification for expired code: ${doc.id}`);
        });
      }
    }

    // Also cleanup old notifications (older than 24 hours) to prevent accumulation
    // Note: This requires a Firestore composite index on (type, createdAt)
    let oldNotificationsDeleted = 0;
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const oldNotificationsQuery = await adminDb.collection('notifications')
        .where('type', '==', 'VerificationRequested')
        .where('createdAt', '<', oneDayAgo)
        .get();

      oldNotificationsQuery.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
        oldNotificationsDeleted++;
      });
    } catch (indexError: any) {
      // Index may not exist yet - skip old notification cleanup
      console.warn('⚠️ Skipping old notification cleanup (index not created):', indexError.message);
      console.log('📋 Create index here:', indexError.details);
    }

    // Commit the batch deletion
    await batch.commit();

    const totalDeleted = deletedCount + oldNotificationsDeleted;
    console.log(`🧹 Cleaned up ${deletedCount} expired verification codes and ${oldNotificationsDeleted} old notifications`);

    return NextResponse.json({ 
      success: true, 
      message: `Cleaned up ${deletedCount} expired verification codes and ${oldNotificationsDeleted} old notifications`,
      cleanedCount: totalDeleted,
      codesDeleted: deletedCount,
      notificationsDeleted: oldNotificationsDeleted
    });

  } catch (error: any) {
    console.error('Error cleaning up expired codes:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return NextResponse.json({ 
      error: 'Failed to cleanup expired codes',
      details: error.message,
      code: error.code
    }, { status: 500 });
  }
}
