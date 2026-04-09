import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Cleanup old unauth users and handle application states
 * This should be called periodically (e.g., daily cron job)
 */
export async function POST(request: NextRequest) {
  try {

    if (!adminDb) {
      console.error('❌ Admin Firestore not initialized');
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const fortyFiveDaysAgo = new Date(now.getTime() - (45 * 24 * 60 * 60 * 1000));


    // Get all unauth users
    const unauthUsersQuery = await adminDb.collection('unauthUsers').get();

    let deletedCount = 0;
    let movedCount = 0;
    const cleanupResults = [];

    for (const doc of unauthUsersQuery.docs) {
      const userData = doc.data();
      const userId = doc.id;
      const createdAt = new Date(userData.createdAt);
      const lastLoginAt = new Date(userData.lastLoginAt);


      // Check if user should be deleted (45+ days old with no activity)
      if (lastLoginAt < fortyFiveDaysAgo) {
        
        try {
          // Delete from Firebase Auth
          await adminAuth.deleteUser(userId);
          console.log(`✅ Deleted Firebase Auth user: ${userId}`);
        } catch (authError: any) {
          console.error(`❌ Failed to delete Firebase Auth user ${userId}:`, authError.message);
        }

        // Delete from unauthUsers collection
        await adminDb.collection('unauthUsers').doc(userId).delete();
        console.log(`✅ Deleted unauthUsers document: ${userId}`);
        
        deletedCount++;
        cleanupResults.push({
          userId,
          action: 'deleted',
          reason: '45+ days inactive'
        });
        continue;
      }

      // Check if user should be moved to users collection (approved applications)
      if (userData.status === 'approved') {
        
        try {
          // Check if user already exists in users collection
          const existingUserDoc = await adminDb.collection('users').doc(userId).get();
          if (existingUserDoc.exists) {
            continue;
          }

          // Move to users collection
          const userDocData = {
            uid: userId,
            email: userData.email,
            name: userData.displayName,
            role: 'student', // Default role for approved applications
            createdAt: userData.createdAt,
            lastLoginAt: userData.lastLoginAt,
            profilePhotoUrl: userData.profilePhotoUrl || null
          };

          await adminDb.collection('users').doc(userId).set(userDocData);

          // Create student document
          const studentDocData = {
            uid: userId,
            email: userData.email,
            fullName: userData.displayName,
            profilePhotoUrl: userData.profilePhotoUrl || null,
            createdAt: userData.createdAt,
            updatedAt: new Date().toISOString()
          };

          await adminDb.collection('students').doc(userId).set(studentDocData);

          // Delete from unauthUsers collection
          await adminDb.collection('unauthUsers').doc(userId).delete();
          
          movedCount++;
          cleanupResults.push({
            userId,
            action: 'moved',
            reason: 'approved application'
          });
        } catch (moveError: any) {
          console.error(`❌ Failed to move user ${userId}:`, moveError.message);
        }
        continue;
      }

      // Check if user should be deleted (rejected applications)
      if (userData.status === 'rejected') {
        
        try {
          // Delete from Firebase Auth
          await adminAuth.deleteUser(userId);
          console.log(`✅ Deleted Firebase Auth user: ${userId}`);
        } catch (authError: any) {
          console.error(`❌ Failed to delete Firebase Auth user ${userId}:`, authError.message);
        }

        // Delete from unauthUsers collection
        await adminDb.collection('unauthUsers').doc(userId).delete();
        console.log(`✅ Deleted unauthUsers document: ${userId}`);
        
        deletedCount++;
        cleanupResults.push({
          userId,
          action: 'deleted',
          reason: 'rejected application'
        });
        continue;
      }

    }


    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      results: {
        totalProcessed: unauthUsersQuery.docs.length,
        deleted: deletedCount,
        moved: movedCount,
        kept: unauthUsersQuery.docs.length - deletedCount - movedCount
      },
      details: cleanupResults
    });

  } catch (error: any) {
    console.error('❌ Error during cleanup:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup unauth users' },
      { status: 500 }
    );
  }
}












