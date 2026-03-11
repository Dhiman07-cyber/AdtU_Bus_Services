import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { decrementBusCapacity } from '@/lib/busCapacityService';
import { withSecurity } from '@/lib/security/api-security';
import { DeleteStudentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_key_secret: '', // placeholder if needed
        api_key_id: '', // placeholder if needed
        ...{
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        }
    });
}

export const POST = withSecurity(
    async (request, { body }) => {
        const { uid } = body as any;

        // Get the student data to check if they have a profile photo
        const studentDocRef = adminDb.collection('students').doc(uid);
        const studentDoc = await studentDocRef.get();

        if (!studentDoc.exists) {
            return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
        }

        const studentData = studentDoc.data();
        const busId = studentData?.busId || studentData?.currentBusId || studentData?.assignedBusId || null;

        // Delete profile photo from Cloudinary if it exists
        if (studentData.profilePhotoUrl && cloudinary.config().api_key) {
            try {
                const url = new URL(studentData.profilePhotoUrl);
                const pathParts = url.pathname.split('/');
                const uploadIndex = pathParts.findIndex(part => part === 'upload');
                if (uploadIndex !== -1) {
                    const afterUpload = pathParts.slice(uploadIndex + 1);
                    const fileName = afterUpload[afterUpload.length - 1];
                    if (fileName) {
                        const publicIdParts = afterUpload.filter(part => !part.startsWith('v') || isNaN(Number(part.substring(1))));
                        const lastPart = publicIdParts[publicIdParts.length - 1];
                        const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
                        publicIdParts[publicIdParts.length - 1] = nameWithoutExtension;
                        const publicId = publicIdParts.join('/');
                        await cloudinary.uploader.destroy(publicId);
                    }
                }
            } catch (cloudinaryError) {
                console.error('Cloudinary deletion error:', cloudinaryError);
            }
        }

        // Cleanup associated data
        const cleanupTasks = [
            // FCM tokens
            async () => {
                const snapshot = await adminDb.collection('fcm_tokens').where('userUid', '==', uid).get();
                const batch = adminDb.batch();
                snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                await batch.commit();
            },
            // Waiting flags
            async () => {
                const snapshot = await adminDb.collection('waiting_flags').where('student_uid', '==', uid).get();
                const batch = adminDb.batch();
                snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                await batch.commit();
            },
            // Attendance
            async () => {
                const snapshot = await adminDb.collection('attendance').where('studentUid', '==', uid).get();
                const batch = adminDb.batch();
                snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                await batch.commit();
            }
        ];

        for (const task of cleanupTasks) {
            try { await task(); } catch (err) { console.error('Cleanup error:', err); }
        }

        // Decrement bus capacity
        if (busId) {
            try {
                await decrementBusCapacity(busId, uid, studentData.shift);
            } catch (busError) {
                console.error('Bus capacity update error:', busError);
            }
        }

        // Delete Firestore documents
        await studentDocRef.delete();
        await adminDb.collection('users').doc(uid).delete();

        // Delete Firebase Auth user
        try {
            const userRecord = await adminAuth.getUser(uid);
            const hasGoogleProvider = userRecord.providerData.some(p => p.providerId === 'google.com');
            if (hasGoogleProvider) {
                try {
                    await adminAuth.updateUser(uid, { providerToDelete: ['google.com'] });
                } catch (disconnectError) {
                    console.error('Google provider disconnect error:', disconnectError);
                }
            }
            await adminAuth.deleteUser(uid);
        } catch (authError) {
            console.error('Firebase Auth deletion error:', authError);
        }

        return NextResponse.json({
            success: true,
            message: 'Student and all associated data deleted successfully'
        });
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: DeleteStudentSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);