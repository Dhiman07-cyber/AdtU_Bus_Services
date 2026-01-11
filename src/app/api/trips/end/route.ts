import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { cleanupTripData } from '@/lib/cleanup-helpers';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const driverId = decodedToken.uid;

    // Verify user is a driver
    const driverDoc = await adminDb.collection('drivers').doc(driverId).get();
    
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Not a driver' }, { status: 403 });
    }

    const body = await request.json();
    const { tripId } = body;

    if (!tripId) {
      return NextResponse.json({ error: 'Trip ID required' }, { status: 400 });
    }

    // Verify the trip belongs to this driver
    const tripDoc = await adminDb.collection('trip_logs').doc(tripId).get();
    
    if (tripDoc.exists) {
      const tripData = tripDoc.data();
      if (tripData?.driverId !== driverId) {
        return NextResponse.json({ 
          error: 'Unauthorized to end this trip' 
        }, { status: 403 });
      }
    }

    // Clean up all trip data
    const result = await cleanupTripData(tripId, driverId);

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to clean up trip data' 
      }, { status: 500 });
    }

    // Update driver status to idle
    await adminDb.collection('drivers').doc(driverId).update({
      currentTripId: null,
      status: 'idle',
      lastTripEndedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Trip ended and data cleaned up successfully'
    });
  } catch (error: any) {
    console.error('Error ending trip:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to end trip' },
      { status: 500 }
    );
  }
}

