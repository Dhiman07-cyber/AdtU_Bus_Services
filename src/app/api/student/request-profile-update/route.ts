import { NextResponse } from 'next/server';
import { db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { RequestProfileUpdateSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/student/request-profile-update
 * 
 * Creates a profile update request from a student, to be approved by their bus driver.
 */
export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { newImageUrl, fullName } = body as any;
        const studentUid = auth.uid;

        // Check if the student record exists
        const studentDoc = await adminDb.collection('students').doc(studentUid).get();
        if (!studentDoc.exists) {
            return NextResponse.json(
                { error: 'Student record not found' },
                { status: 404 }
            );
        }

        const studentData = studentDoc.data()!;
        const currentImageUrl = studentData.profilePhotoUrl || '';
        const currentName = studentData.fullName || studentData.name || '';
        const assignedBusId = studentData.assignedBusId || studentData.busId || null;

        // Create a profile update request
        const requestId = `profile_update_${studentUid}_${Date.now()}`;
        const requestData = {
            requestId,
            studentUid,
            studentName: currentName,
            currentImageUrl,
            newImageUrl,
            currentName,
            newName: fullName || currentName,
            assignedBusId, // Store the bus ID so drivers can filter requests
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        // Save the request and update student ref
        await Promise.all([
            adminDb.collection('profile_update_requests').doc(requestId).set(requestData),
            adminDb.collection('students').doc(studentUid).update({
                pendingProfileUpdate: requestId,
                updatedAt: FieldValue.serverTimestamp()
            })
        ]);

        console.log(`Profile update request created for student ${studentUid}: ${requestId}`);

        return NextResponse.json({
            success: true,
            message: 'Profile update request sent to driver for approval',
            requestId
        });
    },
    {
        requiredRoles: ['student'],
        schema: RequestProfileUpdateSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);