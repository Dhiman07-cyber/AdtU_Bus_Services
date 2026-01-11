import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET() {
  try {
    // Test connection by checking if we can access the database
    const { data, error } = await supabase
      .from('bus_locations')
      .select('count()', { count: 'exact' });
    
    if (error) {
      console.error('Supabase connection test failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Supabase connection failed',
        details: error.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Supabase connection successful',
      tableCount: data
    });
  } catch (error: any) {
    console.error('Error testing Supabase connection:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to test Supabase connection' 
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    // This endpoint is for testing purposes only
    // In a real scenario, you would run the SQL migrations manually
    // or through the Supabase dashboard
    
    return NextResponse.json({ 
      success: true, 
      message: 'Supabase initialization endpoint is ready. Please run the SQL migrations manually from supabase/migrations/ directory.' 
    });
  } catch (error: any) {
    console.error('Error initializing Supabase:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to initialize Supabase' 
    }, { status: 500 });
  }
}