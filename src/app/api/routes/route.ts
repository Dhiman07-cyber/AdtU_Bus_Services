import { NextResponse } from 'next/server';
import { getAllRoutes } from '@/lib/dataService';

export async function GET() {
  try {
    // Use the data service function which extracts routes from buses collection
    const routes = await getAllRoutes();
    return NextResponse.json(routes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newRouteData = await request.json();
    
    // Validate required fields
    if (!newRouteData.routeName || !newRouteData.stops) {
      return NextResponse.json({ error: 'Route name and stops are required' }, { status: 400 });
    }
    
    // If Firestore is available, use it
    if (db) {
      try {
        // Create new route document
        const newRoute = {
          routeId: newRouteData.routeId || `route_${Date.now()}`,
          routeName: newRouteData.routeName,
          stops: Array.isArray(newRouteData.stops) ? newRouteData.stops : [],
          totalStops: Array.isArray(newRouteData.stops) ? newRouteData.stops.length : 0,
          assignedBuses: newRouteData.assignedBuses || [],
          estimatedTime: newRouteData.estimatedTime || '',
          status: newRouteData.status || 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await db.collection('routes').doc(newRoute.routeId).set(newRoute);
        
        return NextResponse.json({ 
          id: newRoute.routeId,
          ...newRoute
        }, { status: 201 });
      } catch (firestoreError) {
        console.error('Error creating route in Firestore:', firestoreError);
        return NextResponse.json({ error: 'Failed to create route in Firestore' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Firestore not initialized' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error adding route:', error);
    return NextResponse.json({ error: 'Failed to add route' }, { status: 500 });
  }
}