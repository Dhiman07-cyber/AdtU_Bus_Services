import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Find all notifications with redundant applicationDetails
    const notificationsQuery = await adminDb.collection('notifications')
      .where('type', '==', 'VerificationRequested')
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
      details: error.message 
    }, { status: 500 });
  }
}





























