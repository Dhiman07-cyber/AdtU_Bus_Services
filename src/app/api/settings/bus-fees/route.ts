import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { NotificationService } from '@/lib/notifications/NotificationService';
import { NotificationTarget } from '@/lib/notifications/types';
import fs from 'fs';
import path from 'path';

// Use system_config.json instead of bus_fee.json
const CONFIG_PATH = path.join(process.cwd(), 'src', 'config', 'system_config.json');

// GET: Retrieve bus fees from system config
export async function GET(req: NextRequest) {
  try {
    // Check if JSON file exists
    if (fs.existsSync(CONFIG_PATH)) {
      const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const systemConfig = JSON.parse(fileContent);
      // Access busFee from system config
      const busFeeData = systemConfig.busFee || { amount: 5000 }; // Default fallback

      return NextResponse.json({
        amount: busFeeData.amount,
        fees: busFeeData.amount
      });
    }

    return NextResponse.json(
      { message: 'Configuration file not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching bus fees:', error);
    return NextResponse.json(
      { message: 'Failed to fetch bus fees' },
      { status: 500 }
    );
  }
}

// POST: Update bus fees (Admin only)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Check if user is admin
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      return NextResponse.json(
        { message: 'Access denied. Admin only.' },
        { status: 403 }
      );
    }

    const { amount } = await req.json();

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { message: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Read current config
    let systemConfig: any = {};
    if (fs.existsSync(CONFIG_PATH)) {
      const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
      try {
        systemConfig = JSON.parse(fileContent);
      } catch (e) {
        console.warn('Could not parse existing config file');
      }
    }

    const oldAmount = systemConfig.busFee?.amount || 1200;

    // Update bus fees in system config
    const newBusFeeData = {
      amount: amount,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
      version: (systemConfig.busFee?.version || 0) + 1,
      history: [
        ...(systemConfig.busFee?.history || []),
        {
          amount: oldAmount,
          updatedAt: systemConfig.busFee?.updatedAt || new Date().toISOString(),
          updatedBy: systemConfig.busFee?.updatedBy || 'system'
        }
      ]
    };

    systemConfig.busFee = newBusFeeData;
    // Also update top-level metadata
    systemConfig.lastUpdated = new Date().toISOString();
    systemConfig.updatedBy = uid;

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(systemConfig, null, 2), 'utf-8');

    console.log(`✅ Bus fee updated by admin ${uid}: ${oldAmount} -> ${amount}`);


    // Get admin user details for notification sender
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    const adminData = adminDoc.exists ? adminDoc.data() : {};
    const adminName = adminData?.name || adminData?.fullName || 'Admin';
    const adminEmployeeId = adminData?.employeeId || undefined;

    // Try to create notification (non-critical, don't fail the update if it fails)
    let notificationSent = false;
    try {
      const notificationService = new NotificationService();

      const target: NotificationTarget = {
        type: 'all_users'
      };

      const notificationContent = `The bus fee for the upcoming session has been revised from ₹${oldAmount.toLocaleString('en-IN')} to ₹${amount.toLocaleString('en-IN')}. ` +
        `Please update your payment plans accordingly. For any queries, contact the administration office.`;

      const sender = {
        userId: uid,
        userName: adminName,
        userRole: 'admin' as const,
        ...(adminEmployeeId && { employeeId: adminEmployeeId })
      };

      await notificationService.createNotification(
        sender,
        target,
        notificationContent,
        '💰 Bus Fee Update - Important Notice',
        { type: 'announcement' }
      );
      notificationSent = true;
      console.log('✅ Notification sent to all users');
    } catch (notificationError: any) {
      console.error('Failed to send notification (non-critical):', notificationError);
      // Don't throw - the bus fees update should succeed even if notification fails
    }

    return NextResponse.json({
      message: notificationSent
        ? 'Bus fees updated successfully. Notification sent to all users.'
        : 'Bus fees updated successfully.',
      amount: amount,
      oldAmount: oldAmount
    });
  } catch (error) {
    console.error('Error updating bus fees:', error);
    return NextResponse.json(
      { message: 'Failed to update bus fees' },
      { status: 500 }
    );
  }
}

