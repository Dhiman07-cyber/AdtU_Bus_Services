import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    const permissionDenied = await requireModeratorPermission(auth, 'buses', 'canView');
    if (permissionDenied) return permissionDenied;

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
    return NextResponse.json({ error: 'Failed to fetch bus data' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    const permissionDenied = await requireModeratorPermission(auth, 'buses', 'canEdit');
    if (permissionDenied) return permissionDenied;

    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Bus ID is required' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const requestBody = await request.json();

    // FIELD ALLOW-LIST: Only safe fields may be updated via API
    const ALLOWED_FIELDS = new Set([
      'busNumber', 'busName', 'routeId', 'capacity', 'status', 'notes'
    ]);
    const BLOCKED_FIELDS = new Set([
      'activeDriverId', 'assignedDriverId'
    ]);

    const busData: Record<string, any> = {};
    for (const [key, value] of Object.entries(requestBody)) {
      if (BLOCKED_FIELDS.has(key)) {
        console.warn(`Blocked attempt to update forbidden field: ${key}`);
        continue;
      }
      if (ALLOWED_FIELDS.has(key)) {
        busData[key] = value;
      }
    }
    
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
    return NextResponse.json({ error: 'Failed to update bus data' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    const permissionDenied = await requireModeratorPermission(auth, 'buses', 'canDelete');
    if (permissionDenied) return permissionDenied;

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
    return NextResponse.json({ error: 'Failed to delete bus' }, { status: 500 });
  }
}
