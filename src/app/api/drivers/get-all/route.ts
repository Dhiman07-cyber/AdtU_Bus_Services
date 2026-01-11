import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
    try {
        console.log('📋 Drivers Get-All API called');
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');

        if (!token) {
            console.error('❌ No token provided');
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const decodedToken = await adminAuth.verifyIdToken(token);
        console.log('✅ Token verified for user:', decodedToken.uid);

        // Check if adminDb is available
        if (!adminDb) {
            console.error('❌ Admin Firestore not initialized');
            return NextResponse.json({ success: false, error: 'Database not available' }, { status: 500 });
        }

        // Get all drivers from drivers collection
        console.log('🔍 Fetching drivers from drivers collection');
        const driversQuery = await adminDb.collection('drivers').get();
        console.log('📊 Found', driversQuery.docs.length, 'driver documents');

        const drivers = driversQuery.docs
            .filter((doc: any) => {
                const data = doc.data();
                // Consider drivers active if:
                // 1. They don't have a status field (default to active)
                // 2. They have status === 'active' 
                // 3. They have a valid email and name (basic validation)
                const hasValidData = data.email && (data.name || data.fullName);
                const isActive = hasValidData && (!data.status || data.status === 'active' || data.active === true);
                return isActive;
            })
            .map((doc: any) => {
                const data = doc.data();
                const driver = {
                    id: doc.id,
                    name: data.name || data.fullName || 'Unknown Driver',
                    fullName: data.fullName || data.name || 'Unknown Driver',
                    employeeId: data.employeeId || data.driverId || data.empId || 'N/A',
                    driverId: data.employeeId || data.driverId || 'N/A',
                    email: data.email,
                    phone: data.phone || data.phoneNumber,
                    assignedBusId: data.assignedBusId || data.busAssigned || null,
                    assignedRouteId: data.assignedRouteId || data.routeId || null,
                    role: 'driver',
                    active: data.active || data.status === 'active' || !data.status
                };
                return driver;
            });

        console.log('📊 Returning', drivers.length, 'active drivers');
        return NextResponse.json({
            success: true,
            drivers
        });
    } catch (error: any) {
        console.error('Error fetching drivers:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch drivers' },
            { status: 500 }
        );
    }
}
