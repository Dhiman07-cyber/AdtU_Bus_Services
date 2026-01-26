/**
 * Simulate Deadlines API
 * 
 * Simulates soft block and hard delete eligibility for a given date.
 * Can optionally execute actual deletions when execute=true.
 * 
 * LOGIC:
 * - Soft Block: simYear == sessionEndYear && simDate >= softBlockDate(sessionEndYear)
 * - Hard Delete: simYear >= sessionEndYear + 1 && simDate >= hardDeleteDate(sessionEndYear + 1)
 * 
 * POST /api/admin/simulate-deadlines
 * Body: {
 *   simulatedDate: ISO date string,
 *   dryRun: boolean (default true),
 *   execute: boolean (default false),
 *   manualMode: boolean (default false),
 *   selectedForSoftBlock: string[] (UIDs for manual mode),
 *   selectedForHardDelete: string[] (UIDs for manual mode),
 *   customDeadlines: { softBlock: {...}, hardDelete: {...} } (optional overrides)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { decrementBusCapacity } from '@/lib/busCapacityService';

// Configure Cloudinary
if (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

interface StudentStatus {
    uid: string;
    name: string;
    enrollmentId: string;
    email: string;
    validUntil: string;
    sessionEndYear: number;
    status: string;
    softBlockDate: string;
    hardDeleteDate: string;
    shouldSoftBlock: boolean;
    shouldHardDelete: boolean;
    daysPastSoftBlock: number;
    daysPastHardDelete: number;
}

export async function POST(request: NextRequest) {
    try {
        // Verify admin authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // Verify user is admin
        const adminDoc = await adminDb.collection('admins').doc(decodedToken.uid).get();
        if (!adminDoc.exists) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const {
            simulatedDate,
            dryRun = true,
            execute = false,
            manualMode = false,
            selectedForSoftBlock = [],
            selectedForHardDelete = [],
            customDeadlines = null
        } = body;

        if (!simulatedDate) {
            return NextResponse.json({ error: 'simulatedDate is required' }, { status: 400 });
        }

        const simDate = new Date(simulatedDate);
        const simYear = simDate.getFullYear();

        // Load deadline config (can be overridden by customDeadlines)
        const configPath = path.join(process.cwd(), 'src', 'config', 'deadline-config.json');
        const configContent = fs.readFileSync(configPath, 'utf8');
        let config = JSON.parse(configContent);

        // Apply custom deadline overrides if provided
        if (customDeadlines) {
            if (customDeadlines.softBlock) {
                config.softBlock = { ...config.softBlock, ...customDeadlines.softBlock };
            }
            if (customDeadlines.hardDelete) {
                config.hardDelete = { ...config.hardDelete, ...customDeadlines.hardDelete };
            }
            if (customDeadlines.renewalDeadline) {
                config.renewalDeadline = { ...config.renewalDeadline, ...customDeadlines.renewalDeadline };
            }
        }

        console.log(`📅 Simulating for date: ${simDate.toISOString()}`);
        console.log(`   Using config: softBlock=${config.softBlock.month + 1}/${config.softBlock.day}, hardDelete=${config.hardDelete.month + 1}/${config.hardDelete.day}`);

        // Fetch all students
        const studentsSnapshot = await adminDb.collection('students').get();
        const allStudents: StudentStatus[] = [];
        const eligibleForSoftBlock: StudentStatus[] = [];
        const eligibleForHardDelete: StudentStatus[] = [];
        const alreadyBlocked: StudentStatus[] = [];

        studentsSnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            const data = doc.data();

            // Parse validUntil
            let validUntil: Date | null = null;
            let validUntilStr: string | null = null;
            if (data.validUntil) {
                if (typeof data.validUntil === 'string') {
                    validUntil = new Date(data.validUntil);
                    validUntilStr = data.validUntil;
                } else if (data.validUntil.toDate) {
                    validUntil = data.validUntil.toDate();
                    validUntilStr = validUntil?.toISOString() ?? null;
                }
            }

            // Get session end year
            // If syncSessionYear is enabled, we treat their session as ending in the simulated year
            // This satisfies "Simulate Date will be the VALID UNTIL of student"
            const sessionEndYear = (body.syncSessionYear || true)
                ? simYear
                : (validUntil ? validUntil?.getFullYear() : null);

            if (!sessionEndYear) {
                allStudents.push({
                    uid: doc.id,
                    name: data.name || data.fullName || 'Unknown',
                    enrollmentId: data.enrollmentId || data.id || 'N/A',
                    email: data.email || 'N/A',
                    validUntil: 'Not Set',
                    sessionEndYear: 0,
                    status: data.status || 'unknown',
                    softBlockDate: 'N/A',
                    hardDeleteDate: 'N/A',
                    shouldSoftBlock: false,
                    shouldHardDelete: false,
                    daysPastSoftBlock: 0,
                    daysPastHardDelete: 0,
                });
                return;
            }

            // ✅ USE PRE-STORED DATES from Firestore (primary source)
            // Fallback to computed dates if missing (for legacy migration)
            let studentSoftBlockDate: Date;
            let studentHardDeleteDate: Date;

            if (data.softBlock) {
                // Use stored date
                studentSoftBlockDate = new Date(data.softBlock);
            } else {
                // Fallback: Compute from config
                studentSoftBlockDate = new Date(
                    sessionEndYear,
                    config.softBlock.month,
                    config.softBlock.day,
                    config.softBlock.hour || 0,
                    config.softBlock.minute || 0
                );
            }

            if (data.hardBlock) {
                // Use stored date
                studentHardDeleteDate = new Date(data.hardBlock);
            } else {
                // Fallback: Compute from config
                studentHardDeleteDate = new Date(
                    sessionEndYear + 1,
                    config.hardDelete.month,
                    config.hardDelete.day,
                    config.hardDelete.hour || 0,
                    config.hardDelete.minute || 0
                );
            }

            // ✅ COMPARE current simulated date against stored dates
            const isPastSoftBlock = simDate >= studentSoftBlockDate;
            const isPastHardDelete = simDate >= studentHardDeleteDate;

            // Calculate days past
            const daysPastSoftBlock = isPastSoftBlock
                ? Math.floor((simDate.getTime() - studentSoftBlockDate.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
            const daysPastHardDelete = isPastHardDelete
                ? Math.floor((simDate.getTime() - studentHardDeleteDate.getTime()) / (1000 * 60 * 60 * 24))
                : 0;

            const studentStatus: StudentStatus = {
                uid: doc.id,
                name: data.name || data.fullName || 'Unknown',
                enrollmentId: data.enrollmentId || data.id || 'N/A',
                email: data.email || 'N/A',
                validUntil: validUntil?.toISOString() || 'N/A',
                sessionEndYear,
                status: data.status || 'active',
                softBlockDate: studentSoftBlockDate.toISOString(),
                hardDeleteDate: studentHardDeleteDate.toISOString(),
                shouldSoftBlock: isPastSoftBlock && !isPastHardDelete,
                shouldHardDelete: isPastHardDelete,
                daysPastSoftBlock,
                daysPastHardDelete,
            };

            allStudents.push(studentStatus);

            // Categorize (only if not in manual mode)
            if (!manualMode) {
                if (data.status === 'soft_blocked' || data.status === 'pending_deletion') {
                    alreadyBlocked.push(studentStatus);
                } else if (isPastHardDelete) {
                    eligibleForHardDelete.push(studentStatus);
                } else if (isPastSoftBlock) {
                    eligibleForSoftBlock.push(studentStatus);
                }
            }
        });

        // In manual mode, use the selected UIDs
        if (manualMode) {
            selectedForSoftBlock.forEach((uid: string) => {
                const student = allStudents.find(s => s.uid === uid);
                if (student && !eligibleForSoftBlock.find(s => s.uid === uid)) {
                    eligibleForSoftBlock.push(student);
                }
            });
            selectedForHardDelete.forEach((uid: string) => {
                const student = allStudents.find(s => s.uid === uid);
                if (student && !eligibleForHardDelete.find(s => s.uid === uid)) {
                    eligibleForHardDelete.push(student);
                }
            });
        }

        const safeStudents = allStudents.length - eligibleForSoftBlock.length - eligibleForHardDelete.length - alreadyBlocked.length;

        console.log(`📊 Results:`);
        console.log(`   Total: ${allStudents.length}`);
        console.log(`   Soft Block: ${eligibleForSoftBlock.length}`);
        console.log(`   Hard Delete: ${eligibleForHardDelete.length}`);
        console.log(`   Already Blocked: ${alreadyBlocked.length}`);
        console.log(`   Safe: ${safeStudents}`);

        // If execute mode, perform actual actions
        if (execute && !dryRun) {
            console.log(`⚠️ EXECUTING ACTUAL ACTIONS...`);

            const executionResults = {
                softBlocked: 0,
                hardDeleted: 0,
                errors: [] as string[],
            };

            // Soft block students (only those not eligible for hard delete)
            for (const student of eligibleForSoftBlock) {
                try {
                    await adminDb.collection('students').doc(student.uid).update({
                        status: 'soft_blocked',
                        softBlockedAt: new Date().toISOString(),
                    });
                    executionResults.softBlocked++;
                    console.log(`✅ Soft blocked: ${student.name} (${student.uid})`);
                } catch (err: any) {
                    executionResults.errors.push(`Soft block failed for ${student.uid}: ${err.message}`);
                }
            }

            // Hard delete students
            for (const student of eligibleForHardDelete) {
                try {
                    // Get full student data for comprehensive cleanup
                    const studentDoc = await adminDb.collection('students').doc(student.uid).get();
                    const studentData = studentDoc.exists ? studentDoc.data() : null;

                    if (!studentData) {
                        console.log(`⚠️ Student data not found for ${student.uid}, proceeding with partial cleanup`);
                    }

                    // 1. Delete profile photo from Cloudinary
                    // Try to get profile photo URL from various potential fields
                    const profilePhotoUrl = studentData?.profilePhotoUrl || studentData?.profileImage || studentData?.photoUrl || studentData?.imageUrl;

                    if (profilePhotoUrl && cloudinary.config().api_key) {
                        try {
                            const url = new URL(profilePhotoUrl);
                            const pathParts = url.pathname.split('/');

                            // Find the part after 'upload' to get the full path
                            const uploadIndex = pathParts.findIndex(part => part === 'upload');
                            if (uploadIndex !== -1) {
                                // Get everything after 'upload' (version, folder, filename)
                                const afterUpload = pathParts.slice(uploadIndex + 1);
                                const fileName = afterUpload[afterUpload.length - 1];

                                if (fileName) {
                                    // Remove version (v1234567890) and get the actual public ID path
                                    const publicIdParts = afterUpload.filter(part => !part.startsWith('v') || isNaN(Number(part.substring(1))));
                                    // Remove file extension from the last part
                                    const lastPart = publicIdParts[publicIdParts.length - 1];
                                    const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
                                    publicIdParts[publicIdParts.length - 1] = nameWithoutExtension;
                                    const publicId = publicIdParts.join('/');

                                    await cloudinary.uploader.destroy(publicId);
                                    console.log(`✅ Deleted profile photo from Cloudinary: ${publicId}`);
                                }
                            }
                        } catch (cloudErr) {
                            console.warn(`⚠️ Cloudinary delete warning for ${student.uid}:`, cloudErr);
                        }
                    }

                    // 2. Delete FCM tokens
                    try {
                        const fcmSnapshot = await adminDb.collection('fcm_tokens').where('userUid', '==', student.uid).get();
                        if (!fcmSnapshot.empty) {
                            const batch = adminDb.batch();
                            fcmSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                            await batch.commit();
                            console.log(`✅ Deleted ${fcmSnapshot.size} FCM tokens for ${student.uid}`);
                        }
                    } catch (fcmError) {
                        console.warn(`⚠️ FCM cleanup warning for ${student.uid}:`, fcmError);
                    }

                    // 3. Delete waiting flags
                    try {
                        const waitingSnapshot = await adminDb.collection('waiting_flags').where('student_uid', '==', student.uid).get();
                        if (!waitingSnapshot.empty) {
                            const batch = adminDb.batch();
                            waitingSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                            await batch.commit();
                            console.log(`✅ Deleted ${waitingSnapshot.size} waiting flags for ${student.uid}`);
                        }
                    } catch (waitingError) {
                        console.warn(`⚠️ Waiting flags cleanup warning for ${student.uid}:`, waitingError);
                    }

                    // 4. Delete attendance records
                    try {
                        const attendanceSnapshot = await adminDb.collection('attendance').where('studentUid', '==', student.uid).get();
                        if (!attendanceSnapshot.empty) {
                            const batch = adminDb.batch();
                            attendanceSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                            await batch.commit();
                            console.log(`✅ Deleted ${attendanceSnapshot.size} attendance records for ${student.uid}`);
                        }
                    } catch (attendanceError) {
                        console.warn(`⚠️ Attendance cleanup warning for ${student.uid}:`, attendanceError);
                    }

                    // 5. Delete profile update requests
                    try {
                        const profileRequestsSnapshot = await adminDb.collection('profile_update_requests').where('studentUid', '==', student.uid).get();
                        if (!profileRequestsSnapshot.empty) {
                            const batch = adminDb.batch();
                            profileRequestsSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
                            await batch.commit();
                            console.log(`✅ Deleted ${profileRequestsSnapshot.size} profile update requests for ${student.uid}`);
                        }
                    } catch (requestsError) {
                        console.warn(`⚠️ Profile update requests cleanup warning for ${student.uid}:`, requestsError);
                    }

                    // 6. Decrement bus capacity (Using Service Logic)
                    const busId = studentData?.busId || studentData?.currentBusId || studentData?.assignedBusId;
                    if (busId) {
                        try {
                            await decrementBusCapacity(busId, student.uid, studentData?.shift);
                            console.log(`✅ Decremented bus capacity for bus ${busId}`);
                        } catch (busError) {
                            console.warn(`⚠️ Bus capacity update warning for ${student.uid}:`, busError);
                        }
                    }

                    // 7. Delete from Firebase Auth with Enhanced Google Provider Handling
                    try {
                        // Check for Google provider
                        try {
                            const userRecord = await adminAuth.getUser(student.uid);
                            const hasGoogleProvider = userRecord.providerData.some((provider: any) => provider.providerId === 'google.com');

                            if (hasGoogleProvider) {
                                console.log(`User ${student.uid} has Google provider - disconnecting...`);
                                await adminAuth.updateUser(student.uid, {
                                    providerToDelete: 'google.com'
                                });
                            }
                        } catch (getUserErr) {
                            // User might not exist or other error, continue to delete
                            console.log(`Note: User record check failed (might already be deleted):`, getUserErr);
                        }

                        // Actually delete user
                        await adminAuth.deleteUser(student.uid);
                        console.log(`✅ Deleted Auth user: ${student.uid}`);
                    } catch (authErr: any) {
                        if (!authErr.message?.includes('no user record') && !authErr.code?.includes('user-not-found')) {
                            console.warn(`Auth delete warning for ${student.uid}:`, authErr.message);
                        }
                    }

                    // 8. Delete from Firestore (students collection)
                    await adminDb.collection('students').doc(student.uid).delete();
                    console.log(`✅ Deleted Firestore student doc: ${student.uid}`);

                    // 9. Delete from users collection
                    try {
                        await adminDb.collection('users').doc(student.uid).delete();
                        console.log(`✅ Deleted Firestore users doc: ${student.uid}`);
                    } catch (usersError) {
                        console.log(`Note: No users doc for ${student.uid} or already deleted`);
                    }

                    // 10. Delete from Supabase payments (Audit Log - Optional)
                    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                        // We keep for audit purposes as requested
                        console.log(`ℹ️ Supabase payments preserved for audit (student: ${student.uid})`);
                    }

                    executionResults.hardDeleted++;
                    console.log(`🗑️ HARD DELETED COMPLETE: ${student.name} (${student.uid})`);
                } catch (err: any) {
                    executionResults.errors.push(`Hard delete failed for ${student.uid}: ${err.message}`);
                }
            }

            return NextResponse.json({
                success: true,
                executed: true,
                result: {
                    simulatedDate: simDate.toISOString(),
                    totalStudents: allStudents.length,
                    allStudents,
                    eligibleForSoftBlock,
                    eligibleForHardDelete,
                    alreadyBlocked,
                    safeStudents,
                    errors: executionResults.errors,
                },
                executionResults,
            });
        }

        // Dry run - just return results
        return NextResponse.json({
            success: true,
            executed: false,
            result: {
                simulatedDate: simDate.toISOString(),
                totalStudents: allStudents.length,
                allStudents,
                eligibleForSoftBlock,
                eligibleForHardDelete,
                alreadyBlocked,
                safeStudents,
                errors: [],
            },
        });

    } catch (error: any) {
        console.error('Simulation error:', error);
        return NextResponse.json(
            { error: error.message || 'Simulation failed' },
            { status: 500 }
        );
    }
}
