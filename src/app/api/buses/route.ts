import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');

    // Fetch buses from Firestore
    let busesSnapshot;
    if (routeId) {
      // Filter by routeId if provided
      busesSnapshot = await db.collection('buses').where('routeId', '==', routeId).get();
    } else {
      // Fetch all buses
      busesSnapshot = await db.collection('buses').get();
    }
    
    const buses = busesSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      };
    });
    
    // Return in the expected format
    return NextResponse.json({ buses });
  } catch (error: any) {
    console.error('Error fetching buses:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch buses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const busData = await request.json();
    
    // Validate required fields
    if (!busData.busNumber || !busData.routeId) {
      return NextResponse.json({ error: 'Bus number and route ID are required' }, { status: 400 });
    }
    
    // Create new bus document
    const newBus = {
      busId: busData.busId || `bus_${Date.now()}`,
      busNumber: busData.busNumber,
      model: busData.model || 'Standard Model',
      capacity: busData.capacity || 50,
      driverUID: busData.driverUID || null,
      driverName: busData.driverName || '',
      routeId: busData.routeId,
      routeName: busData.routeName || '',
      status: busData.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await db.collection('buses').doc(newBus.busId).set(newBus);
    
    return NextResponse.json({ 
      id: newBus.busId,
      ...newBus
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating bus:', error);
    return NextResponse.json({ error: error.message || 'Failed to create bus' }, { status: 500 });
  }
}