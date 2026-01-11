import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');
    
    if (!tableName) {
      return NextResponse.json({ error: 'Table name is required' }, { status: 400 });
    }
    
    // Try to access the table
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      // Check if it's a "relation does not exist" error
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return NextResponse.json({ exists: false, error: 'Table does not exist' });
      }
      // For other errors, still consider the table as existing but with access issues
      return NextResponse.json({ exists: true, error: error.message });
    }
    
    return NextResponse.json({ exists: true, count });
  } catch (error: any) {
    console.error('Error checking table:', error);
    return NextResponse.json({ exists: false, error: error.message || 'Failed to check table' });
  }
}