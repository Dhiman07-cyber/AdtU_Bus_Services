import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { UpdateProfilePhotoSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { body }) => {
        const { studentUid, newProfilePhotoUrl } = body as any;

        const studentRef = adminDb.collection('students').doc(studentUid);
        const studentDoc = await studentRef.get();

        if (!studentDoc.exists) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        await studentRef.update({
            profilePhotoUrl: newProfilePhotoUrl,
            updatedAt: new Date().toISOString()
        });

        console.log(`✅ Updated profile photo URL for student ${studentUid}: ${newProfilePhotoUrl}`);

        return NextResponse.json({
            success: true,
            message: 'Profile photo URL updated successfully',
            studentUid: studentUid,
            newProfilePhotoUrl: newProfilePhotoUrl
        });
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: UpdateProfilePhotoSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);
