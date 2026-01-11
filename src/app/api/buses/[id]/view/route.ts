import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Bus ID is required' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    // Fetch bus data directly from Firestore
    const busDoc = await db.collection('buses').doc(id).get();
    
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();
    
    return NextResponse.json({ 
      id: busDoc.id,
      ...busData
    });
  } catch (error: any) {
    console.error('Error fetching bus data:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch bus data' }, { status: 500 });
  }
}