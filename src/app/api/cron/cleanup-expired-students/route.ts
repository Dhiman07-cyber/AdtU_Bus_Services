
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { shouldBlockAccessFromStoredDates, shouldHardDeleteFromStoredDates } from '@/lib/utils/renewal-utils';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { v2 as cloudinary } from 'cloudinary';
import { decrementBusCapacity } from '@/lib/busCapacityService';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

// Configure Cloudinary
if (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

/**
 * AUTOMATED CRON JOB for Soft Block & Hard Delete
 * 
 * Scheduled to run daily (or as configured).
 * Uses PRE-STORED softBlock and hardBlock dates from student documents.
 * Migrates legacy students without these fields by computing from validUntil.
 * 
 * - Soft Blocks students who have passed the soft block date.
 * - Hard Deletes students who have passed the hard delete date.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Authorization Check (CRITICAL)
        const authHeader = request.headers.get('Authorization');
        const cronSecret = process.env.CRON_SECRET;

        // In production, strictly enforce CRON_SECRET. 
        // For dev/testing, you might allow manual overrides or disable this check carefully.
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Load deadline config dynamically from Firestore
        const config = await getDeadlineConfig() as any;

        console.log(`🔄 Running Automated Cleanup Cron Job`);
        // Handle config.softBlock potentially being undefined or different structure if casting failed
        const softBlockStr = config.softBlock ? `${config.softBlock.month + 1}/${config.softBlock.day}` : 'Unknown';
        const hardDeleteStr = config.hardDelete ? `${config.hardDelete.month + 1}/${config.hardDelete.day}` : 'Unknown';

        console.log(`   Config: SoftBlock=${softBlockStr}, HardDelete=${hardDeleteStr}`);
        console.log(`   Using PRE-STORED softBlock/hardBlock dates from student documents`);

        // 2. Fetch all students
        const studentsSnapshot = await adminDb.collection('students').get();
        const results = {
            totalChecked: studentsSnapshot.size,
            softBlocked: 0,
            hardDeleted: 0,
            blockDatesAdded: 0,
            errors: [] as string[]
        };

        // 3. Iterate and Apply Logic
        for (const doc of studentsSnapshot.docs) {
            const studentData = doc.data();
            const uid = doc.id;

            try {
                // Parse validUntil
                let validUntilStr: string | null = null;
                if (studentData.validUntil) {
                    if (typeof studentData.validUntil === 'string') {
                        validUntilStr = studentData.validUntil;
                    } else if (studentData.validUntil.toDate) {
                        validUntilStr = studentData.validUntil.toDate().toISOString();
                    }
                }

                // Parse lastRenewalDate
                let lastRenewalDateStr: string | null = null;
                if (studentData.lastRenewalDate) {
                    if (typeof studentData.lastRenewalDate === 'string') {
                        lastRenewalDateStr = studentData.lastRenewalDate;
                    } else if (studentData.lastRenewalDate.toDate) {
                        lastRenewalDateStr = studentData.lastRenewalDate.toDate().toISOString();
                    }
                }

                // MIGRATION: If student has no softBlock/hardBlock fields, compute from validUntil
                let softBlockStr = studentData.softBlock;
                let hardBlockStr = studentData.hardBlock;

                if ((!softBlockStr || !hardBlockStr) && validUntilStr) {
                    // Compute from validUntil date (the single source of truth) with dynamic configuration
                    const blockDates = computeBlockDatesFromValidUntil(validUntilStr, config);

                    // Update student document with computed block dates
                    await adminDb.collection('students').doc(uid).update({
                        softBlock: blockDates.softBlock,
                        hardBlock: blockDates.hardBlock,
                        blockDatesComputedAt: new Date().toISOString()
                    });

                    softBlockStr = blockDates.softBlock;
                    hardBlockStr = blockDates.hardBlock;
                    results.blockDatesAdded++;
                    console.log(`📅 Added block dates for ${studentData.fullName || uid}: softBlock=${softBlockStr.split('T')[0]}, hardBlock=${hardBlockStr.split('T')[0]}`);
                }

                // Prepare student data object for optimized checks
                const studentCheckData = {
                    softBlock: softBlockStr,
                    hardBlock: hardBlockStr,
                    validUntil: validUntilStr,
                    lastRenewalDate: lastRenewalDateStr,
                    status: studentData.status,
                    sessionEndYear: studentData.sessionEndYear
                };

                // Check using optimized stored-date functions with dynamic config override
                const needsSoftBlock = shouldBlockAccessFromStoredDates(studentCheckData, null, config);
                const needsHardDelete = shouldHardDeleteFromStoredDates(studentCheckData, null, config);

                // --- HARD DELETE EXECUTION ---
                if (needsHardDelete) {
                    console.log(`🗑️ HARD DELETE triggered for ${studentData.fullName || 'Unknown'} (${uid})`);
                    console.log(`   hardBlock date: ${hardBlockStr}`);

                    // 1. Delete profile photo from Cloudinary
                    const profilePhotoUrl = studentData.profilePhotoUrl || studentData.profileImage || studentData.photoUrl || studentData.imageUrl;
                    if (profilePhotoUrl && cloudinary.config().api_key) {
                        try {
                            const url = new URL(profilePhotoUrl);
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
                                    console.log(`   ✅ Deleted Cloudinary image: ${publicId}`);
                                }
                            }
                        } catch (cloudErr) {
                            console.warn(`   ⚠️ Cloudinary delete warning for ${uid}:`, cloudErr);
                        }
                    }

                    // 2. Delete FCM tokens
                    const fcmSnapshot = await adminDb.collection('fcm_tokens').where('userUid', '==', uid).get();
                    if (!fcmSnapshot.empty) {
                        const batch = adminDb.batch();
                        fcmSnapshot.docs.forEach((d: any) => batch.delete(d.ref));
                        await batch.commit();
                        console.log(`   ✅ Deleted ${fcmSnapshot.size} FCM tokens`);
                    }

                    // 3. Delete waiting flags
                    const waitingSnapshot = await adminDb.collection('waiting_flags').where('student_uid', '==', uid).get();
                    if (!waitingSnapshot.empty) {
                        const batch = adminDb.batch();
                        waitingSnapshot.docs.forEach((d: any) => batch.delete(d.ref));
                        await batch.commit();
                        console.log(`   ✅ Deleted ${waitingSnapshot.size} waiting flags`);
                    }

                    // 4. Delete attendance records
                    const attendanceSnapshot = await adminDb.collection('attendance').where('studentUid', '==', uid).get();
                    if (!attendanceSnapshot.empty) {
                        const batch = adminDb.batch();
                        attendanceSnapshot.docs.forEach((d: any) => batch.delete(d.ref));
                        await batch.commit();
                        console.log(`   ✅ Deleted ${attendanceSnapshot.size} attendance records`);
                    }

                    // 5. Delete profile update requests
                    const profileRequestsSnapshot = await adminDb.collection('profile_update_requests').where('studentUid', '==', uid).get();
                    if (!profileRequestsSnapshot.empty) {
                        const batch = adminDb.batch();
                        profileRequestsSnapshot.docs.forEach((d: any) => batch.delete(d.ref));
                        await batch.commit();
                        console.log(`   ✅ Deleted ${profileRequestsSnapshot.size} profile update requests`);
                    }

                    // 6. Decrement bus capacity
                    const busId = studentData.busId || studentData.currentBusId || studentData.assignedBusId;
                    if (busId) {
                        try {
                            await decrementBusCapacity(busId, uid, studentData.shift);
                            console.log(`   ✅ Decremented bus capacity for bus ${busId}`);
                        } catch (busError) {
                            console.warn(`   ⚠️ Bus capacity update warning for ${uid}:`, busError);
                        }
                    }

                    // 7. Delete from Firebase Auth (w/ Google Disconnect)
                    try {
                        try {
                            const userRecord = await adminAuth.getUser(uid);
                            const hasGoogleProvider = userRecord.providerData.some((provider: any) => provider.providerId === 'google.com');

                            if (hasGoogleProvider) {
                                await adminAuth.updateUser(uid, { providerToDelete: 'google.com' });
                                console.log(`   ℹ️ Disconnected Google provider`);
                            }
                        } catch (getUserErr) {
                            // User might not exist
                        }
                        await adminAuth.deleteUser(uid);
                        console.log(`   ✅ Deleted Auth user`);
                    } catch (authErr: any) {
                        if (!authErr.message?.includes('no user record') && !authErr.code?.includes('user-not-found')) {
                            console.warn(`   ⚠️ Auth delete warning:`, authErr.message);
                        }
                    }

                    // 8. Delete Firestore Documents
                    await adminDb.collection('students').doc(uid).delete();
                    try {
                        await adminDb.collection('users').doc(uid).delete();
                    } catch (e) { /* Ignore if missing */ }
                    console.log(`   ✅ Deleted Firestore docs`);

                    results.hardDeleted++;
                    continue; // Skip soft block check since user is gone
                }

                // --- SOFT BLOCK EXECUTION ---
                // Only if not already blocked and not just deleted
                if (needsSoftBlock && studentData.status === 'active') {
                    console.log(`🔒 SOFT BLOCK triggered for ${studentData.fullName || 'Unknown'} (${uid})`);
                    console.log(`   softBlock date: ${softBlockStr}`);
                    await adminDb.collection('students').doc(uid).update({
                        status: 'soft_blocked',
                        softBlockedAt: new Date().toISOString()
                    });
                    results.softBlocked++;
                }

            } catch (err: any) {
                console.error(`❌ Error processing student ${uid}:`, err);
                results.errors.push(`Error processing ${uid}: ${err.message}`);
            }
        }

        console.log(`✅ Cron Job Completed:`, results);
        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error('❌ Cron Job Fatal Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
