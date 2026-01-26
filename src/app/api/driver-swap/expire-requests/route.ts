import { NextResponse } from 'next/server';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';

export async function POST(request: Request) {
  try {
    // This endpoint can be called by a cron job or manually by an admin
    // For production, you might want to verify this is called from a trusted source

    // Check for a secret key in headers (for cron job authentication)
    const authHeader = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && authHeader !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Expire old pending requests using Supabase
    const result = await DriverSwapSupabaseService.expirePendingRequests();

    return NextResponse.json({
      success: true,
      expired: result.expired,
      message: `Expired ${result.expired} pending requests`
    });

  } catch (error: any) {
    console.error('Error expiring requests:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // Allow GET for manual triggering by admins
  return POST(request);
}
