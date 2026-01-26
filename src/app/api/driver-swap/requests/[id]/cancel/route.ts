import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params in Next.js 13+ App Router
    const resolvedParams = await params;
    const requestId = resolvedParams.id;

    // Get authentication token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userUID = decodedToken.uid;

    console.log(`📥 Cancel swap request: ${requestId} by ${userUID.substring(0, 8)}`);

    // Cancel the swap request using Supabase
    const result = await DriverSwapSupabaseService.cancelSwapRequest(requestId, userUID);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to cancel swap request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Swap request cancelled successfully'
    });

  } catch (error: any) {
    console.error('Error cancelling swap request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
