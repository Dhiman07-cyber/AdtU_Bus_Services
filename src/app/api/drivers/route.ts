import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

// Define types for our data
interface Driver {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  licenseNumber: string;
  assignedBusId?: string;
  assignedRouteId?: string;
  profilePhotoUrl?: string;
  joiningDate?: string;
  createdAt?: string;
  [key: string]: any;
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require admin or moderator authentication
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = await applyRateLimit(createRateLimitId(auth.uid, 'drivers-list'), RateLimits.READ);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const driversRef = db.collection('drivers');
    const querySnapshot = await driversRef.get();

    const drivers: Driver[] = [];
    querySnapshot.forEach((doc: any) => {
      const data = doc.data();
      drivers.push({
        id: doc.id,
        name: data.fullName || data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        alternatePhone: data.alternatePhone || data.phone2 || '',
        licenseNumber: data.licenseNumber || '',
        assignedBusId: data.assignedBusId || data.busAssigned || '',
        assignedRouteId: data.assignedRouteId || data.routeId || '',
        profilePhotoUrl: data.profilePhotoUrl || '',
        joiningDate: data.joiningDate || '',
        createdAt: data.createdAt || ''
      });
    });

    return NextResponse.json(drivers, { headers: rl.headers });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json(handleApiError(error, 'drivers-get', 'Failed to fetch drivers'), { status: 500 });
  }
}