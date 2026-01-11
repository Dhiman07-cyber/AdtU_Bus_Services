import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await adminAuth.verifyIdToken(token);

    const routeId = params.id;

    // Get route document
    const routeDoc = await adminDb.collection('routes').doc(routeId).get();

    if (!routeDoc.exists) {
      // Try getting route from buses collection
      const busesQuery = await adminDb.collection('buses')
        .where('routeId', '==', routeId)
        .limit(1)
        .get();

      if (!busesQuery.empty) {
        const busData = busesQuery.docs[0].data();
        const stops = busData.stops || [];
        return NextResponse.json({ stops });
      }

      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const routeData = routeDoc.data();
    const stops = routeData?.stops || [];

    return NextResponse.json({
      stops
    });
  } catch (error: any) {
    console.error('Error fetching stops:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stops' },
      { status: 500 }
    );
  }
}

