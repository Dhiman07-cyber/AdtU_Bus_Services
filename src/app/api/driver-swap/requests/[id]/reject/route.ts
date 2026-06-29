import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
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
    const rejectorUID = decodedToken.uid;

    // SECURITY: Verify the caller is actually a driver.
    const driverDoc = await adminDb.collection('drivers').doc(rejectorUID).get();
    if (!driverDoc.exists) {
      return NextResponse.json(
        { error: 'Only drivers can reject swap requests' },
        { status: 403 }
      );
    }

    console.log('📥 Reject swap request: %s by %s', requestId, rejectorUID.substring(0, 8));

    // Reject the swap request using Supabase
    const result = await DriverSwapSupabaseService.rejectSwapRequest(requestId, rejectorUID);

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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
