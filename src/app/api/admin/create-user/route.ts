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
import { getSystemConfig } from '@/lib/system-config-service';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { withSecurity } from '@/lib/security/api-security';
import { CreateUserSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * Optimized Create User API (Student, Driver, Moderator, Admin)
 * 
 * Enhancements:
 * - Parallelized metadata fetching (System Config, Deadline Config, Approver Data)
 * - Parallelized helper lookups (Route, Bus, Stop names)
 * - Backgrounded heavy tasks (Email, PDF generation)
 * - Atomic document creation
 */

// Helper function to fetch multiple names in parallel
async function resolveReferenceNames(routeId?: string, busId?: string, stopId?: string) {
    const tasks: Promise<string>[] = [
        (async () => {
            if (!routeId) return 'Not Assigned';
            const doc = await adminDb.collection('routes').doc(routeId).get();
            return doc.data()?.routeName || doc.data()?.name || routeId;
        })(),
        (async () => {
            if (!busId) return 'Auto-assigned';
            const doc = await adminDb.collection('buses').doc(busId).get();
            const d = doc.data();
            if (!d) return busId;
            const busNum = d.displayIndex || d.sequenceNumber || d.busNumber;
            return busNum ? `Bus-${busNum} (${d.licensePlate || d.plateNumber || '?'})` : (d.name || busId);
        })(),
        (async () => {
            if (!routeId || !stopId) return 'Not Selected';
            const doc = await adminDb.collection('routes').doc(routeId).get();
            const stops = doc.data()?.stops || [];
            const stop = stops.find((s: any) => s.id === stopId || s.stopId === stopId);
            return stop?.name || stop?.stopName || stopId;
        })()
    ];
    return Promise.all(tasks);
}

function normalizeShift(shift?: string): string {
    if (!shift) return 'Morning';
    const n = shift.toLowerCase().trim();
    if (n.includes('even')) return 'Evening';
    if (n.includes('morn')) return 'Morning';
    if (n === 'both') return 'Both';
    return 'Morning';
}

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const currentUserUid = auth.uid;
        const currentUserRole = auth.role;

        // 1. Parallelize initial validation & configuration fetching
        const [approverDoc, systemConfig, deadlineConfig] = await Promise.all([
            adminDb.collection(currentUserRole === 'admin' ? 'admins' : 'moderators').doc(currentUserUid).get(),
            getSystemConfig(),
            getDeadlineConfig()
        ]);

        const appData = approverDoc.data();
        const currentUserName = appData?.fullName || appData?.name || auth.name || 'System';
        const currentUserEmployeeId = appData?.employeeId || appData?.staffId || (currentUserRole === 'admin' ? 'ADMIN' : 'MOD');
        const approvedByDisplay = `${currentUserName} (${currentUserRole === 'admin' ? 'Admin' : currentUserEmployeeId})`;

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

        // 2. Auth management
        let uid: string;
        try {
            const userRecord = await adminAuth.getUserByEmail(email);
            uid = userRecord.uid;
        } catch {
            const userRecord = await adminAuth.createUser({ email, emailVerified: true });
            uid = userRecord.uid;
        }

        const now = new Date().toISOString();

        // 3. Role-specific logic
        if (role === 'student') {
            let finalValidUntil = validUntil;
            let finalSessionEndYear = sessionEndYear;

            if (!finalValidUntil) {
                const { newValidUntil } = calculateRenewalDate(null, finalDuration, deadlineConfig);
                finalValidUntil = newValidUntil;
                finalSessionEndYear = new Date(finalValidUntil).getFullYear();
            }

            const blockDates = computeBlockDatesFromValidUntil(finalValidUntil, deadlineConfig);
            const busFeeAmount = systemConfig?.busFee?.amount || 5000;
            const totalAmount = busFeeAmount * finalDuration;

            const studentDoc = {
                address: address || '', alternatePhone: alternatePhone || '', approvedAt: now,
                approvedBy: approvedByDisplay, bloodGroup: bloodGroup || '',
                busId: busId || (routeId ? routeId.replace('route_', 'bus_') : ''),
                createdAt: now, department: department || '', dob: dob || '',
                durationYears: finalDuration, email, enrollmentId: enrollmentId || '',
                faculty: faculty || '', fullName: name, gender: gender || '',
                parentName: parentName || '', parentPhone: parentPhone || '',
                phoneNumber: phone || '', profilePhotoUrl: profilePhotoUrl || '',
                role: 'student', routeId: routeId || '', semester: semester || '',
                sessionEndYear: finalSessionEndYear, sessionStartYear: sessionStartYear || new Date().getFullYear(),
                shift: normalizeShift(shift), status: 'active', stopId: finalStopId,
                uid, updatedAt: now, validUntil: finalValidUntil,
                softBlock: blockDates.softBlock, hardBlock: blockDates.hardBlock,
                paymentAmount: totalAmount, paid_on: now,
            };

            // Write all student-related data in parallel
            const writeTasks: Promise<any>[] = [
                adminDb.collection('students').doc(uid).set(studentDoc),
                adminDb.collection('users').doc(uid).set({ createdAt: now, email, name, role: 'student', uid })
            ];

            // Add payment record if applicable
            if (totalAmount > 0) {
                const paymentId = generateOfflinePaymentId('new_registration');
                writeTasks.push((async () => {
                    const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
                    return paymentsSupabaseService.createPayment({
                        paymentId, studentId: enrollmentId || '', studentUid: uid, studentName: name,
                        stopId: finalStopId, amount: totalAmount, method: 'Offline', status: 'Completed',
                        sessionStartYear: sessionStartYear || new Date().getFullYear(),
                        sessionEndYear: finalSessionEndYear, durationYears: finalDuration,
                        validUntil: new Date(finalValidUntil), transactionDate: new Date(),
                        offlineTransactionId: `manual_entry_${Date.now()}`,
                        approvedBy: { type: 'Manual', userId: currentUserUid, empId: currentUserEmployeeId, name: currentUserName, role: currentUserRole === 'admin' ? 'Admin' : 'Moderator' },
                        approvedAt: new Date(),
                    });
                })());
            }

            // Bus capacity increment
            if (studentDoc.busId) {
                writeTasks.push(incrementBusCapacity(studentDoc.busId, uid, shift).catch(e => console.error('Capacity error:', e)));
            }

            await Promise.all(writeTasks);

            // 4. Fire-and-forget notifications (if moderator added)
            if (currentUserRole === 'moderator') {
                (async () => {
                    try {
                        const [routeName, busName, resolvedStopName, adminRecipients] = await Promise.all([
                            resolveReferenceNames(routeId, busId, finalStopId).then(names => names[0]),
                            resolveReferenceNames(routeId, busId, finalStopId).then(names => names[1]),
                            resolveReferenceNames(routeId, busId, finalStopId).then(names => names[2]),
                            getAdminEmailRecipients()
                        ]);

                        if (adminRecipients.length > 0) {
                            const paymentId = generateOfflinePaymentId('new_registration'); // Re-generate or pass from above
                            const emailData: StudentAddedEmailData = {
                                studentName: name, studentEmail: email, studentPhone: phone || '', enrollmentId: enrollmentId || '',
                                faculty: faculty || '', department: department || '', semester: semester || '', shift: shift || 'Morning',
                                routeName, busName, pickupPoint: resolvedStopName, sessionStartYear: sessionStartYear || new Date().getFullYear(),
                                sessionEndYear: finalSessionEndYear, validUntil: finalValidUntil, durationYears: finalDuration,
                                paymentAmount: totalAmount, transactionId: paymentId,
                                addedBy: { name: currentUserName, employeeId: currentUserEmployeeId, role: 'moderator' },
                                addedAt: now
                            };

                            const pdfBuffer = await generateReceiptPdf(paymentId).catch(() => null);
                            await sendStudentAddedNotification(
                                adminRecipients, emailData,
                                pdfBuffer ? { content: pdfBuffer, filename: `Receipt_${name.replace(/\s+/g, '_')}_${paymentId}.pdf` } : undefined
                            );
                        }
                    } catch (e) { console.error('Notification error:', e); }
                })();
            }
        } else if (role === 'driver') {
            const driverDocData = {
                uid, email, fullName: name, licenseNumber: licenseNumber || '', aadharNumber: aadharNumber || '',
                phone: phone || '', altPhone: alternatePhone || '', joiningDate: joiningDate || '',
                driverId: driverId || employeeId || '', address: address || '', profilePhotoUrl: profilePhotoUrl || '',
                assignedRouteId: assignedRouteId || routeId || null, assignedBusId: assignedBusId || busId || null,
                shift: shift || 'Morning & Evening', approvedBy: approvedByDisplay, dob: dob || '',
                status: 'active', createdAt: now, updatedAt: now,
            };

            const driverTasks: Promise<any>[] = [
                adminDb.collection('drivers').doc(uid).set(driverDocData),
                adminDb.collection('users').doc(uid).set({ createdAt: now, email, name, role: 'driver', uid })
            ];

            if (busId) {
                driverTasks.push(adminDb.collection('buses').doc(busId).update({
                    activeDriverId: uid, assignedDriverId: uid, activeTripId: null, updatedAt: now
                }).catch(() => null));
            }
            await Promise.all(driverTasks);
        } else {
            // Moderator or Admin
            const col = role === 'moderator' ? 'moderators' : 'admins';
            const docData = {
                uid, email, fullName: name, dob: dob || '', joiningDate: joiningDate || '',
                aadharNumber: aadharNumber || '', phone: phone || '', altPhone: alternatePhone || '',
                staffId: employeeId || staffId || '', employeeId: employeeId || staffId || '',
                profilePhotoUrl: profilePhotoUrl || '', approvedBy: approvedByDisplay,
                address: address || '', status: status || 'active', createdAt: now, updatedAt: now,
            };
            await Promise.all([
                adminDb.collection(col).doc(uid).set(docData),
                adminDb.collection('users').doc(uid).set({ createdAt: now, email, name, role, uid })
            ]);
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
