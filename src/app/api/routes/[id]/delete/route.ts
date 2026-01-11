import { NextResponse } from 'next/server';
import { deleteRouteAndData } from '@/lib/cleanup-helpers';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    console.log(`Deleting route with ID: ${id}`);
    
    // Use centralized cleanup helper to delete route and associated data
    const result = await deleteRouteAndData(id);
    
    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to delete route' 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Route deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting route:', error);
    return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 });
  }
}
