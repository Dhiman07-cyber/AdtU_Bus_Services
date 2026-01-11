import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { DriverSwapService } from '@/lib/driver-swap-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params in Next.js 13+ App Router
    const resolvedParams = await params;
    const requestId = resolvedParams.id;
    const body = await request.json();
    const { reason } = body;

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
    const rejectorUID = decodedToken.uid;

    // Reject the swap request
    const result = await DriverSwapService.rejectSwapRequest(requestId, rejectorUID, reason);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to reject swap request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Swap request rejected'
    });

  } catch (error: any) {
    console.error('Error rejecting swap request:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
