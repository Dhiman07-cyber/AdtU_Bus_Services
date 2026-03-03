// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/moderators/[id]/permissions
 * Fetch a moderator's permissions
 */
export async function GET(
    request: NextRequest,
    { params }: any
) {
    try {
        const { id } = await params;
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decodedToken = await adminAuth.verifyIdToken(token);

        // Only admins can view moderator permissions
        if (!adminDb) {
            return NextResponse.json({ error: 'Database not available' }, { status: 500 });
        }

        // Verify the caller is an admin
        const callerDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        const callerData = callerDoc.data();
        if (!callerData || callerData.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Fetch the moderator document
        const modDoc = await adminDb.collection('moderators').doc(id).get();
        if (!modDoc.exists) {
            return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
        }

        const modData = modDoc.data();
        return NextResponse.json({
            success: true,
            permissions: modData?.permissions || null,
            moderator: {
                id: modDoc.id,
                name: modData?.fullName || modData?.name || 'Unknown',
                email: modData?.email || '',
                employeeId: modData?.employeeId || modData?.empId || '',
                status: modData?.status || 'active',
            },
        });
    } catch (error: any) {
        console.error('Error fetching moderator permissions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch permissions' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/moderators/[id]/permissions
 * Update a moderator's permissions (admin only)
 */
export async function PUT(
    request: NextRequest,
    { params }: any
) {
    try {
        const { id } = await params;
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decodedToken = await adminAuth.verifyIdToken(token);

        if (!adminDb) {
            return NextResponse.json({ error: 'Database not available' }, { status: 500 });
        }

        // Verify the caller is an admin
        const callerDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        const callerData = callerDoc.data();
        if (!callerData || callerData.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Verify the target moderator exists
        const modDoc = await adminDb.collection('moderators').doc(id).get();
        if (!modDoc.exists) {
            return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
        }

        const body = await request.json();
        const { permissions } = body;

        if (!permissions) {
            return NextResponse.json({ error: 'Permissions data is required' }, { status: 400 });
        }

        // Validate the permissions structure
        const requiredCategories = ['students', 'drivers', 'buses', 'routes', 'applications', 'payments'];
        for (const category of requiredCategories) {
            if (!permissions[category] || typeof permissions[category] !== 'object') {
                return NextResponse.json(
                    { error: `Invalid permissions: missing category '${category}'` },
                    { status: 400 }
                );
            }
        }

        // Update the moderator document with the new permissions
        await adminDb.collection('moderators').doc(id).update({
            permissions,
            permissionsUpdatedAt: new Date().toISOString(),
            permissionsUpdatedBy: decodedToken.uid,
        });

        console.log(`✅ Permissions updated for moderator ${id} by admin ${decodedToken.uid}`);

        return NextResponse.json({
            success: true,
            message: 'Moderator permissions updated successfully',
        });
    } catch (error: any) {
        console.error('Error updating moderator permissions:', error);
        return NextResponse.json(
            { error: 'Failed to update permissions' },
            { status: 500 }
        );
    }
}
