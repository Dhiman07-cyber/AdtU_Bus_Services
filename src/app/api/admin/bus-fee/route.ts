/**
 * API Route: Bus Fee Management
 * GET /api/admin/bus-fee - Get current bus fee
 * POST /api/admin/bus-fee - Update bus fee
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getCurrentBusFee, updateBusFee, getBusFeeHistory } from '@/lib/bus-fee-service';

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const includeHistory = url.searchParams.get('history') === 'true';

    const currentFee = await getCurrentBusFee();
    
    const response: any = {
      success: true,
      currentFee,
      timestamp: new Date().toISOString()
    };

    if (includeHistory) {
      response.history = await getBusFeeHistory();
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error getting bus fee:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { amount } = body;

    if (typeof amount !== 'number' || amount < 0) {
      return NextResponse.json(
        { error: 'Valid amount required' },
        { status: 400 }
      );
    }

    const result = await updateBusFee(decodedToken.uid, amount);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // Send notification to all users about fee change
    try {
      await sendBusFeeUpdateNotification(amount, result.previousAmount, decodedToken.uid);
    } catch (notificationError) {
      console.warn('Failed to send notification (non-critical):', notificationError);
    }

    return NextResponse.json({
      success: true,
      message: 'Bus fee updated successfully',
      newAmount: amount,
      previousAmount: result.previousAmount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error updating bus fee:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Send notification to all users about bus fee update
 */
async function sendBusFeeUpdateNotification(
  newAmount: number, 
  previousAmount: number, 
  adminUid: string
): Promise<void> {
  try {
    // Get admin name
    const adminDoc = await adminDb.collection('users').doc(adminUid).get();
    const adminName = adminDoc.data()?.name || adminDoc.data()?.email || 'Admin';

    // Create notification for all users
    const notification = {
      type: 'bus_fee_update',
      title: 'Bus Fee Updated',
      message: `Bus fee has been updated from ₹${previousAmount?.toLocaleString('en-IN') || 0} to ₹${newAmount.toLocaleString('en-IN')} by ${adminName}`,
      data: {
        newAmount,
        previousAmount,
        updatedBy: adminName,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      read: false
    };

    // Get all user UIDs
    const usersSnapshot = await adminDb.collection('users').get();
    
    // Batch create notifications
    const batch = adminDb.batch();
    usersSnapshot.docs.forEach(doc => {
      const notificationRef = adminDb.collection('notifications').doc();
      batch.set(notificationRef, {
        ...notification,
        userId: doc.id,
        userRole: doc.data()?.role
      });
    });

    await batch.commit();
    console.log(`✅ Bus fee update notification sent to ${usersSnapshot.size} users`);
  } catch (error) {
    console.error('Error sending bus fee notification:', error);
    throw error;
  }
}
