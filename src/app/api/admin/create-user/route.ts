import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { incrementBusCapacity } from '@/lib/busCapacityService';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import {
    sendStudentAddedNotification,
    getAdminEmailRecipients,
    StudentAddedEmailData,
} from '@/lib/services/admin-email.service';
import { generateReceiptPdf } from '@/lib/services/receipt.service';
import { createUpdatedByEntry } from '@/lib/utils/updatedBy';
import { getSystemConfig } from '@/lib/system-config-service';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { withSecurity } from '@/lib/security/api-security';
import { CreateUserSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Helper function to get route name from routeId
async function getRouteName(routeId: string): Promise<string> {
    if (!routeId) return 'Not Assigned';
    try {
        const routeDoc = await adminDb.collection('routes').doc(routeId).get();
        if (routeDoc.exists) {
            return routeDoc.data()?.routeName || routeDoc.data()?.name || routeId;
        }
    } catch (e) {
        console.error('Error fetching route name:', e);
    }
    return routeId;
}

// Helper function to get bus name from busId
async function getBusName(busId: string): Promise<string> {
    if (!busId) return 'Auto-assigned';
    try {
        const busDoc = await adminDb.collection('buses').doc(busId).get();
        if (busDoc.exists) {
            const data = busDoc.data();
            const busNumber = data?.displayIndex || data?.sequenceNumber || data?.busNumber;
            const licensePlate = data?.licensePlate || data?.plateNumber;
            if (busNumber && licensePlate) {
                return `Bus-${busNumber} (${licensePlate})`;
            }
            return data?.name || busId;
        }
    } catch (e) {
        console.error('Error fetching bus name:', e);
    }
    return busId;
}

// Helper function to get stop name from route and stopId
async function getStopName(routeId: string, stopId: string): Promise<string> {
    if (!routeId || !stopId) return 'Not Selected';
    try {
        const routeDoc = await adminDb.collection('routes').doc(routeId).get();
        if (routeDoc.exists) {
            const stops = routeDoc.data()?.stops || [];
            const stop = stops.find((s: any) => s.id === stopId || s.stopId === stopId);
            if (stop) {
                return stop.name || stop.stopName || stopId;
            }
        }
    } catch (e) {
        console.error('Error fetching stop name:', e);
    }
    return stopId;
}

// Helper function to normalize shift values
function normalizeShift(shift: string | undefined): string {
    if (!shift) return 'Morning';
    const normalized = shift.toLowerCase().trim();
    if (normalized.includes('evening')) return 'Evening';
    if (normalized.includes('morning')) return 'Morning';
    if (normalized === 'both') return 'Both';
    return 'Morning'; // Default
}

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const currentUserUid = auth.uid;
        const currentUserRole = auth.role;
        let currentUserEmployeeId = 'ADMIN';
        let currentUserName = auth.name || 'System';

        // Fetch extra info for moderators/admins for audit logs
        if (currentUserRole === 'moderator') {
            const modDoc = await adminDb.collection('moderators').doc(currentUserUid).get();
            if (modDoc.exists) {
                currentUserName = modDoc.data()?.fullName || modDoc.data()?.name || currentUserName;
                currentUserEmployeeId = modDoc.data()?.employeeId || modDoc.data()?.staffId || 'MOD';
            }
        } else if (currentUserRole === 'admin') {
            const adminDoc = await adminDb.collection('admins').doc(currentUserUid).get();
            if (adminDoc.exists) {
                currentUserName = adminDoc.data()?.name || currentUserName;
                currentUserEmployeeId = adminDoc.data()?.employeeId || 'ADMIN';
            }
        }

        const {
            email, name, role, phone, alternatePhone, profilePhotoUrl, enrollmentId,
            gender, age, faculty, department, semester, parentName, parentPhone,
            dob, licenseNumber, joiningDate, aadharNumber, driverId,
            employeeId, staffId, assignedRouteId, routeId, assignedBusId,
            busId, address, bloodGroup, shift, durationYears, sessionDuration,
            sessionStartYear, sessionEndYear, validUntil, pickupPoint, stopId, status
        } = body as any;

        const finalStopId = stopId || pickupPoint || '';
        const finalDuration = durationYears || (typeof sessionDuration === 'string' ? parseInt(sessionDuration) : sessionDuration) || 1;

        // Check if user already exists
        let uid: string;
        try {
            const userRecord = await adminAuth.getUserByEmail(email);
            uid = userRecord.uid;
        } catch (error: any) {
            const userRecord = await adminAuth.createUser({
                email: email,
                emailVerified: true
            });
            uid = userRecord.uid;
        }

        const now = new Date().toISOString();
        const approvedByDisplay = currentUserRole === 'admin' ? `${currentUserName} (Admin)` : `${currentUserName} ( ${currentUserEmployeeId} )`;

        // 1. Handle STUDENT creation
        if (role === 'student') {
            let finalValidUntil = validUntil;
            let finalSessionEndYear = sessionEndYear;

            const deadlineConfig = await getDeadlineConfig();

            if (!finalValidUntil) {
                const { newValidUntil } = calculateRenewalDate(null, finalDuration, deadlineConfig);
                finalValidUntil = newValidUntil;
                finalSessionEndYear = new Date(finalValidUntil).getFullYear();
            }

            const blockDates = computeBlockDatesFromValidUntil(finalValidUntil, deadlineConfig);

            const studentDoc: any = {
                address: address || '',
                age: age ? parseInt(age as string) : 0,
                alternatePhone: alternatePhone || '',
                approvedAt: now,
                approvedBy: approvedByDisplay,
                bloodGroup: bloodGroup || '',
                busId: busId || (routeId ? routeId.replace('route_', 'bus_') : ''),
                createdAt: now,
                department: department || '',
                dob: dob || '',
                durationYears: finalDuration,
                email: email,
                enrollmentId: enrollmentId || '',
                faculty: faculty || '',
                fullName: name,
                gender: gender || '',
                parentName: parentName || '',
                parentPhone: parentPhone || '',
                phoneNumber: phone || '',
                profilePhotoUrl: profilePhotoUrl || '',
                role: 'student',
                routeId: routeId || '',
                semester: semester || '',
                sessionEndYear: finalSessionEndYear,
                sessionStartYear: sessionStartYear || new Date().getFullYear(),
                shift: normalizeShift(shift),
                status: 'active',
                stopId: finalStopId,
                uid: uid,
                updatedAt: now,
                validUntil: finalValidUntil,
                softBlock: blockDates.softBlock,
                hardBlock: blockDates.hardBlock,
                paymentAmount: 0,
                paid_on: now,
                updatedBy: [createUpdatedByEntry(currentUserName, currentUserEmployeeId)]
            };

            const systemConfig = await getSystemConfig();
            const busFeeAmount = systemConfig?.busFee?.amount || 5000;
            const totalAmount = busFeeAmount * finalDuration;
            studentDoc.paymentAmount = totalAmount;

            await adminDb.collection('students').doc(uid).set(studentDoc);

            const paymentId = generateOfflinePaymentId('new_registration');
            const offlineTransactionId = `manual_entry_${Date.now()}`;

            if (totalAmount > 0) {
                const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
                await paymentsSupabaseService.createPayment({
                    paymentId,
                    studentId: enrollmentId || '',
                    studentUid: uid,
                    studentName: name,
                    stopId: finalStopId,
                    amount: totalAmount,
                    method: 'Offline',
                    status: 'Completed',
                    sessionStartYear: sessionStartYear || new Date().getFullYear(),
                    sessionEndYear: finalSessionEndYear,
                    durationYears: finalDuration,
                    validUntil: new Date(finalValidUntil),
                    transactionDate: new Date(),
                    offlineTransactionId: offlineTransactionId,
                    approvedBy: {
                        type: 'Manual',
                        userId: currentUserUid,
                        empId: currentUserEmployeeId,
                        name: currentUserName,
                        role: currentUserRole === 'admin' ? 'Admin' : 'Moderator'
                    },
                    approvedAt: new Date(),
                });
            }

            if (studentDoc.busId) {
                try {
                    await incrementBusCapacity(studentDoc.busId, uid, shift);
                } catch (err) {
                    console.error('Bus capacity increment error:', err);
                }
            }

            await adminDb.collection('users').doc(uid).set({
                createdAt: now, email, name, role: 'student', uid
            });

            if (currentUserRole === 'moderator') {
                try {
                    const routeName = await getRouteName(routeId || '');
                    const busName = await getBusName(busId || '');
                    const resolvedStopName = await getStopName(routeId || '', finalStopId);
                    const adminRecipients = await getAdminEmailRecipients();

                    if (adminRecipients.length > 0) {
                        const emailData: StudentAddedEmailData = {
                            studentName: name, studentEmail: email, studentPhone: phone || '', enrollmentId: enrollmentId || '',
                            faculty: faculty || '', department: department || '', semester: semester || '', shift: shift || 'Morning',
                            routeName, busName, pickupPoint: resolvedStopName, sessionStartYear: sessionStartYear || new Date().getFullYear(),
                            sessionEndYear: finalSessionEndYear, validUntil: finalValidUntil, durationYears: finalDuration,
                            paymentAmount: totalAmount, transactionId: paymentId,
                            addedBy: { name: currentUserName, employeeId: currentUserEmployeeId, role: 'moderator' },
                            addedAt: now
                        };

                        await new Promise(resolve => setTimeout(resolve, 500));
                        let pdfBuffer = null;
                        try {
                            pdfBuffer = await generateReceiptPdf(paymentId);
                        } catch (pdfError) {
                            console.error('PDF error:', pdfError);
                        }

                        await sendStudentAddedNotification(
                            adminRecipients,
                            emailData,
                            pdfBuffer ? {
                                content: pdfBuffer,
                                filename: `Receipt_${name.replace(/\s+/g, '_')}_${paymentId}.pdf`
                            } : undefined
                        );
                    }
                } catch (emailError) {
                    console.error('Email notification error:', emailError);
                }
            }
        } else if (role === 'driver') {
            const driverDocData: any = {
                uid, email, fullName: name, licenseNumber: licenseNumber || '', aadharNumber: aadharNumber || '',
                phone: phone || '', altPhone: alternatePhone || '', joiningDate: joiningDate || '',
                driverId: driverId || employeeId || '', address: address || '', profilePhotoUrl: profilePhotoUrl || '',
                assignedRouteId: assignedRouteId || routeId || null, assignedBusId: assignedBusId || busId || null,
                shift: shift || 'Morning & Evening', approvedBy: approvedByDisplay, dob: dob || '',
                status: 'active', createdAt: now, updatedAt: now,
                updatedBy: [createUpdatedByEntry(currentUserName, currentUserEmployeeId)]
            };

            await adminDb.collection('drivers').doc(uid).set(driverDocData);

            if (busId) {
                const busRef = adminDb.collection('buses').doc(busId);
                const busDoc = await busRef.get();
                if (busDoc.exists) {
                    await busRef.update({
                        activeDriverId: uid,
                        assignedDriverId: uid,
                        activeTripId: null,
                        updatedAt: now
                    });
                }
            }
            await adminDb.collection('users').doc(uid).set({
                createdAt: now, email, name, role: 'driver', uid
            });
        } else if (role === 'moderator') {
            const moderatorDocData: any = {
                uid, email, fullName: name, dob: dob || '', joiningDate: joiningDate || '',
                aadharNumber: aadharNumber || '', phone: phone || '', altPhone: alternatePhone || '',
                staffId: employeeId || staffId || '', employeeId: employeeId || staffId || '',
                profilePhotoUrl: profilePhotoUrl || '', approvedBy: approvedByDisplay,
                address: address || '', status: status || 'active', createdAt: now, updatedAt: now,
                updatedBy: [createUpdatedByEntry(currentUserName, currentUserEmployeeId)]
            };
            await adminDb.collection('moderators').doc(uid).set(moderatorDocData);
            await adminDb.collection('users').doc(uid).set({
                createdAt: now, email, name, role: 'moderator', uid
            });
        } else if (role === 'admin') {
            await adminDb.collection('users').doc(uid).set({
                uid, email, name, role, createdAt: now, busFee: 0, busFeeUpdatedAt: now, busFeeVersion: 1
            });
        }

        return NextResponse.json({
            success: true,
            message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully.`
        });
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: CreateUserSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);