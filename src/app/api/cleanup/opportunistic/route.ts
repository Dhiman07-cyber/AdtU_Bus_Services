import { NextResponse } from 'next/server';
import { CleanupService } from '@/lib/cleanup-service';

/**
 * Opportunistic cleanup endpoint
 * Called automatically by various system actions
 */
export async function POST(request: Request) {
  try {
    // Run cleanup asynchronously (don't block the response)
    CleanupService.runOpportunisticCleanup().catch(err => {
      console.error('Background cleanup error:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Cleanup initiated'
    });
  } catch (error: any) {
    console.error('Error initiating cleanup:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate cleanup' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
