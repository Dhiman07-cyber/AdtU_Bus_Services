import { NextResponse } from 'next/server';
import { deleteBusAndData } from '@/lib/cleanup-helpers';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Bus ID is required' }, { status: 400 });
    }

    console.log(`Deleting bus with ID: ${id}`);
    
    // Use centralized cleanup helper to delete bus and associated data
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