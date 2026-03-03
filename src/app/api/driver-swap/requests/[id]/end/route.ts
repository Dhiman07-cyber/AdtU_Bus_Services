import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';

/**
 * POST /api/driver-swap/requests/[id]/end
 * 
 * End an active swap (manual completion or time-based expiry)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🚀 API endpoint /api/driver-swap/requests/[id]/end called');
    // Await params in Next.js 13+ App Router
    const resolvedParams = await params;
    const requestId = resolvedParams.id;
    console.log('📝 Request ID:', requestId);

    // Get authentication token
    const authHeader = request.headers.get('authorization');
    console.log('🔐 Auth header present:', !!authHeader);

    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ No valid auth header');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    console.log('🔐 Verifying token...');
    const decodedToken = await auth.verifyIdToken(token);
    const actorUID = decodedToken.uid;
    console.log('✅ Token verified, actor:', actorUID.substring(0, 8) + '...');

    console.log(`📥 End swap request received:`, {
      requestId,
      actor: actorUID.substring(0, 8) + '...'
    });

    // End the swap using Supabase
    console.log('🔄 Calling DriverSwapSupabaseService.endSwap...');
    const result = await DriverSwapSupabaseService.endSwap(requestId, actorUID);
    console.log('📥 Service result:', result);

    if (!result.success && !result.pendingTripEnd) {
      console.error('❌ Service returned error:', result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to end swap' },
        { status: 400 }
      );
    }

    // Handle pending revert case (trip in progress)
    if (result.pendingTripEnd) {
      console.log('⏳ Swap marked for pending revert (trip in progress)');
      return NextResponse.json({
        success: true,
        pendingTripEnd: true,
        message: 'Swap will end automatically when the current trip is finished.'
      });
    }

    console.log('✅ Swap ended successfully!');
    return NextResponse.json({
      success: true,
      pendingTripEnd: false,
      message: 'Swap ended successfully. Drivers restored to original assignments.'
    });

  } catch (error: any) {
    console.error('❌ Error ending swap:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
