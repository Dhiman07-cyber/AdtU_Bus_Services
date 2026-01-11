import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { getAllBuses } from '@/lib/dataService';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    const updatedRouteData = await request.json();

    // If Firestore is available, use it
    if (db) {
      try {
        // Find the bus that contains this route
        const buses = await getAllBuses();
        const busWithRoute = buses.find(bus => bus.route && bus.route.routeId === id);
        
        if (!busWithRoute) {
          return NextResponse.json({ error: 'Route not found' }, { status: 404 });
        }

        // Update the route data within the bus document
        const updatedRoute = {
          ...updatedRouteData,
          totalStops: Array.isArray(updatedRouteData.stops) ? updatedRouteData.stops.length : 0,
          updatedAt: new Date().toISOString()
        };
        
        // Update the bus document with the new route data
        await db.collection('buses').doc(busWithRoute.busId).update({
          route: updatedRoute,
          updatedAt: new Date().toISOString()
        });
        
        // Return the updated route data
        return NextResponse.json(updatedRoute);
      } catch (firestoreError) {
        console.error('Error updating route in Firestore:', firestoreError);
        return NextResponse.json({ error: 'Failed to update route in Firestore' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Firestore not initialized' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error updating route:', error);
    return NextResponse.json({ error: 'Failed to update route' }, { status: 500 });
  }
}
