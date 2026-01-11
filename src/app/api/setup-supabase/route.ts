import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET() {
  try {
    // Test connection
    const { data, error } = await supabaseAdmin.from('bus_locations').select('bus_id').limit(1);
    
    if (error && !error.message.includes('Could not find the table')) {
      console.error('Supabase connection error:', error);
      return NextResponse.json({ 
        success: false, 
        error: `Connection failed: ${error.message}` 
      }, { status: 500 });
    }

    // If we get here, connection is working (even if table doesn't exist yet)
    return NextResponse.json({ 
      success: true,
      message: 'Supabase connection successful',
      data: data || null,
      error: error?.message || null
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
    // This endpoint would be used to create tables
    // For now, we'll just return instructions
    return NextResponse.json({ 
      success: true,
      message: 'Supabase setup instructions',
      instructions: [
        '1. Go to your Supabase dashboard',
        '2. Navigate to Table Editor',
        '3. Create the following tables:',
        '   - bus_locations (bus_id, driver_uid, lat, lng, speed, heading, accuracy, updated_at)',
        '   - driver_status (driver_uid, bus_id, status, last_updated)',
        '   - waiting_flags (id, student_uid, bus_id, route_id, lat, lng, created_at, expires_at)',
        '   - driver_location_updates (id, bus_id, driver_uid, lat, lng, speed, heading, accuracy, created_at)',
        '4. Enable RLS on all tables',
        '5. Add the RLS policies from the documentation'
      ]
    });
  } catch (error: any) {
    console.error('Error setting up Supabase:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to setup Supabase' 
    }, { status: 500 });
  }
}