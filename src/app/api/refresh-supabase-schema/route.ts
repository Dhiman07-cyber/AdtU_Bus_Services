import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for better permissions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET() {
  try {
    // Try to access all tables to refresh schema cache
    const tables = [
      'bus_locations', 
      'driver_status', 
      'waiting_flags', 
      'driver_location_updates',
      'bus_passenger_counts'
    ];
    const results: any = {};
    
    for (const table of tables) {
      try {
        // First try a simple select to check if table exists
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .limit(1);
        
        // If that fails, try to refresh the schema by accessing table info
        if (error) {
          // Try a different approach to refresh schema
          const { data: tableData, error: tableError } = await supabase
            .from(table)
            .select('*')
            .limit(1);
          
          results[table] = {
            success: !tableError,
            error: tableError?.message || null,
            hasData: tableData && tableData.length > 0,
            method: 'select_with_data'
          };
        } else {
          results[table] = {
            success: true,
            error: null,
            hasData: count !== undefined && count !== null ? count > 0 : false,
            method: 'head_request'
          };
        }
      } catch (error: any) {
        // Try one more approach
        try {
          const { data, error: selectError } = await supabase
            .from(table)
            .select('id') // Just select one column
            .limit(1);
          
          results[table] = {
            success: !selectError,
            error: selectError?.message || null,
            hasData: data && data.length > 0,
            method: 'minimal_select'
          };
        } catch (fallbackError: any) {
          results[table] = {
            success: false,
            error: error.message || fallbackError.message,
            hasData: false,
            method: 'all_attempts_failed'
          };
        }
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Schema refresh attempt completed',
      results
    });
  } catch (error: any) {
    console.error('Error refreshing Supabase schema:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to refresh Supabase schema' 
    }, { status: 500 });
  }
}