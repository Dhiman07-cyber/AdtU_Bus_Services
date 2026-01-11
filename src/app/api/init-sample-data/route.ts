import { NextResponse } from 'next/server';
import { initializeSupabaseData } from '@/lib/supabase-data-init';

export async function POST() {
  try {
    const result = await initializeSupabaseData();
    
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error initializing sample data:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to initialize sample data' 
    }, { status: 500 });
  }
}