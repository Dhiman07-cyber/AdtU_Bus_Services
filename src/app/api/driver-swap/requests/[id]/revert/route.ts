import { NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { DriverSwapService } from '@/lib/driver-swap-service';

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
    const adminUID = decodedToken.uid;

    // Verify user is an admin
    const adminDoc = await db.collection('admins').doc(adminUID).get();
    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    // Revert the swap
    const result = await DriverSwapService.revertSwap(requestId, adminUID);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to revert swap' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Swap reverted successfully'
    });

  } catch (error: any) {
    console.error('Error reverting swap:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
