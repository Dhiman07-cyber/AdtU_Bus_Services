import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Fetch route data directly from Firestore using Admin SDK
    const routeDoc = await db.collection('routes').doc(id).get();

    if (!routeDoc.exists) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: routeDoc.id,
      ...routeDoc.data()
    });
  } catch (error) {
    console.error('Error fetching route:', error);
    return NextResponse.json({ error: 'Failed to fetch route' }, { status: 500 });
  }
}