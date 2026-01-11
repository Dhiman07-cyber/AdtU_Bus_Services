/**
 * API Route: Log Boarding Action
 * POST /api/bus-pass/boarding-action
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scanId, driverUid, action, notes } = body;

    if (!scanId || !driverUid || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['allow', 'deny'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "allow" or "deny"' },
        { status: 400 }
      );
    }

    // Get the scan log to extract student and bus info
    const scanDoc = await adminDb.collection('scans').doc(scanId).get();
    if (!scanDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Scan not found' },
        { status: 404 }
      );
    }

    const scanData = scanDoc.data();

    const boardingActionId = `boarding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const boardingAction = {
      id: boardingActionId,
      scanId,
      studentUid: scanData?.studentUid,
      driverUid,
      busId: scanData?.scannerBusId,
      action,
      notes: notes || '',
      timestamp: Timestamp.now()
    };

    await adminDb.collection('boardingActions').doc(boardingActionId).set(boardingAction);

    return NextResponse.json({
      success: true,
      boardingActionId
    });
  } catch (error: any) {
    console.error('Error in boarding action API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}















