import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Bus ID is required' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const busData = await request.json();
    
    // If routeId is being updated, also update routeName
    let updatedBusData = { ...busData };
    
    if (busData.routeId) {
      try {
        const routeDoc = await db.collection('routes').doc(busData.routeId).get();
        if (routeDoc.exists) {
          updatedBusData.routeName = routeDoc.data().routeName || '';
        }
      } catch (routeError) {
        console.error('Error fetching route name:', routeError);
      }
    }
    
    // Update bus document
    const updatedBus = {
      ...updatedBusData,
      updatedAt: new Date().toISOString()
    };
    
    await db.collection('buses').doc(id).update(updatedBus);
    
    // Fetch updated document
    const busDoc = await db.collection('buses').doc(id).get();
    const updatedData = busDoc.data();
    
    return NextResponse.json({ 
      id: busDoc.id,
      ...updatedData
    });
  } catch (error: any) {
    console.error('Error updating bus data:', error);
    return NextResponse.json({ error: error.message || 'Failed to update bus data' }, { status: 500 });
  }
}