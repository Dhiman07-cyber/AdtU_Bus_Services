import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';
import { decrementBusCapacity } from '@/lib/busCapacityService';
import { withSecurity } from '@/lib/security/api-security';
import { DeleteStudentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

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

        // 1. Delete profile photo from Cloudinary (Fire and forget or parallel)
        const photoCleanup = (async () => {
            if (studentData.profilePhotoUrl) {
                const publicId = extractPublicId(studentData.profilePhotoUrl);
                if (publicId) await deleteAsset(publicId);
            }
        })();

        // 2. Parallel Cleanup Tasks (FCM, Waiting Flags, Attendance, Auth, Firestore)
        const deleteTasks = [
            photoCleanup,
            // FCM tokens
            (async () => {
                const snapshot = await adminDb.collection('fcm_tokens').where('userUid', '==', uid).get();
                const batch = adminDb.batch();
                snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                await batch.commit();
            })(),
            // Waiting flags
            (async () => {
                const snapshot = await adminDb.collection('waiting_flags').where('student_uid', '==', uid).get();
                const batch = adminDb.batch();
                snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                await batch.commit();
            })(),
            // Attendance
            (async () => {
                const snapshot = await adminDb.collection('attendance').where('studentUid', '==', uid).get();
                const batch = adminDb.batch();
                snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                await batch.commit();
            })(),
            // Bus capacity
            (async () => {
                if (busId) await decrementBusCapacity(busId, uid, studentData.shift);
            })(),
            // Firestore Student & User Doc
            studentDocRef.delete(),
            adminDb.collection('users').doc(uid).delete(),
            // Firebase Auth
            (async () => {
                try {
                    await adminAuth.deleteUser(uid);
                } catch (authError: any) {
                    if (authError.code !== 'auth/user-not-found') console.error('Auth deletion error:', authError);
                }
            })()
        ];

        await Promise.allSettled(deleteTasks);

        return NextResponse.json({
            success: true,
            message: 'Student and all associated data deleted successfully'
        });
    },
    {
        requiredRoles: ['admin'],
        schema: DeleteStudentSchema,
        rateLimit: RateLimits.DELETE,
        allowBodyToken: true
    }
);