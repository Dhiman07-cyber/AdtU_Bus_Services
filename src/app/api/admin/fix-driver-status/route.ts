import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * FIX: Set all drivers to 'active' status
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🔧 Starting driver status fix...\n');

    const driversSnapshot = await adminDb.collection('drivers').get();
    console.log(`👥 Found ${driversSnapshot.size} drivers\n`);

    const batch = adminDb.batch();
    const updates: any[] = [];

    driversSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      
      console.log(`👤 ${data.fullName || data.name}`);
      console.log(`   UID: ${doc.id}`);
      console.log(`   Current status: ${data.status || 'undefined'}`);
      
      // Set status to 'active' if not already set
      if (data.status !== 'active') {
        batch.update(doc.ref, { status: 'active' });
        updates.push({
          uid: doc.id,
          name: data.fullName || data.name,
          driverId: data.driverId,
          oldStatus: data.status || 'undefined',
          newStatus: 'active'
        });
        console.log(`   ✅ Will set status to 'active'\n`);
      } else {
        console.log(`   ℹ️ Already active\n`);
      }
    });

    if (updates.length > 0) {
      await batch.commit();
      console.log(`✅ Updated ${updates.length} drivers to active status`);
    } else {
      console.log('ℹ️ All drivers already have active status');
    }

    return NextResponse.json({
      success: true,
      message: `Set ${updates.length} drivers to active status`,
      updates
    });

  } catch (error: any) {
    console.error('❌ Error fixing driver status:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
