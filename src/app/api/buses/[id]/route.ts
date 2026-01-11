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
    
    // Update bus document
    const updatedBus = {
      ...busData,
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Bus ID is required' }, { status: 400 });
    }

    console.log(`Deleting bus with ID: ${id}`);
    
    // Use centralized cleanup helper to delete bus and associated data
    const { deleteBusAndData } = await import('@/lib/cleanup-helpers');
    const result = await deleteBusAndData(id);
    
    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to delete bus' 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Bus deleted successfully' 
    });
  } catch (error: any) {
    console.error('Error deleting bus:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete bus' }, { status: 500 });
  }
}