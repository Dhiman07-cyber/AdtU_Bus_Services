import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const GET = withSecurity(
    async (request, { auth, requestId }) => {
        console.log('📋 Drivers Get-All API called by:', auth.uid.substring(0,8)+'...', '(' + auth.role + ')');

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
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: EmptySchema,
        rateLimit: RateLimits.READ,
    }
);
