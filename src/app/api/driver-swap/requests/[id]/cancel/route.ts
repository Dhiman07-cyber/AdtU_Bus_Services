import { NextResponse } from 'next/server';
import { auth, db, FieldValue } from '@/lib/firebase-admin';

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

    // Get the request document
    const requestDoc = await db.collection('driver_swap_requests').doc(requestId).get();
    if (!requestDoc.exists) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    const requestData = requestDoc.data();

    // Check if user is authorized to cancel (must be the requester or admin)
    const isRequester = requestData?.fromDriverUID === userUID;
    const isAdmin = await db.collection('admins').doc(userUID).get().then((doc: any) => doc.exists);

    if (!isRequester && !isAdmin) {
      return NextResponse.json(
        { error: 'You are not authorized to cancel this request' },
        { status: 403 }
      );
    }

    // Check if request can be cancelled
    if (requestData?.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot cancel request with status: ${requestData?.status}` },
        { status: 400 }
      );
    }

    // DELETE the swap request document immediately
    await requestDoc.ref.delete();
    console.log(`🗑️ Deleted cancelled swap request: ${requestId}`);

    // Send notification to the other driver
    const notifyUID = isRequester ? requestData.toDriverUID : requestData.fromDriverUID;
    await db.collection('notifications').add({
      title: 'Swap Request Cancelled',
      message: `The swap request for Bus ${requestData.busNumber || requestData.busId} has been cancelled.`,
      type: 'info',
      category: 'general',
      audience: [notifyUID],
      status: 'sent',
      createdBy: 'system',
      createdAt: FieldValue.serverTimestamp()
    });

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
