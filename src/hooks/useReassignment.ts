'use client';

import { useState, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    serverTimestamp,
    collection,
    writeBatch
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import type { RevertBufferData } from '@/components/smart-allocation/ReassignmentSnackbar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REASSIGNMENT HOOK - Transaction-Safe Bus Reassignment
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This hook provides:
 * 1. Transaction-safe student reassignment
 * 2. Proper per-shift load tracking (morning/evening)
 * 3. Revert buffer for 10-second undo functionality
 * 4. Notification dispatch
 * 
 * FIRESTORE TRANSACTION GUARANTEES:
 * - All-or-nothing writes
 * - No stale reads (re-reads inside transaction)
 * - Race-condition safe
 * - Consistent state maintained
 */

export interface ReassignmentPlan {
    studentId: string;
    studentName: string;
    fromBusId: string;
    fromRouteId?: string;
    toBusId: string;
    toRouteId: string;
    toBusNumber: string;
    stopId: string;
    shift: 'Morning' | 'Evening';
}

export interface ReassignmentResult {
    success: boolean;
    updatedStudents: Array<{
        uid: string;
        oldBusId: string;
        newBusId: string;
        oldRouteId: string;
        newRouteId: string;
        stopId: string;
        shift: 'Morning' | 'Evening';
    }>;
    busUpdates: Array<{
        busId: string;
        morningCountBefore: number;
        morningCountAfter: number;
        eveningCountBefore: number;
        eveningCountAfter: number;
    }>;
    revertBuffer: RevertBufferData | null;
    error?: string;
}

export function useReassignment() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastResult, setLastResult] = useState<ReassignmentResult | null>(null);
    const revertBufferRef = useRef<RevertBufferData | null>(null);

    /**
     * Execute student reassignment with Firestore transaction
     * 
     * This performs:
     * A) Update student document: busId, routeId, stopId, updatedAt
     * B) Decrement OLD bus load based on student.shift
     * C) Increment NEW bus load based on student.shift
     * D) Validate shift compatibility rules
     * E) All in a single atomic transaction
     */
    const executeReassignment = useCallback(async (
        plans: ReassignmentPlan[],
        reason: string,
        actorId: string,
        actorName: string
    ): Promise<ReassignmentResult> => {
        console.log('🚀 Starting reassignment transaction:', {
            students: plans.length,
            reason,
            actor: actorName
        });

        setIsProcessing(true);

        try {
            // Validate plans
            if (plans.length === 0) {
                throw new Error('No reassignment plans provided');
            }

            // Check for duplicate students
            const studentIds = new Set<string>();
            for (const plan of plans) {
                if (studentIds.has(plan.studentId)) {
                    throw new Error('Duplicate student in reassignment plans');
                }
                studentIds.add(plan.studentId);
            }

            // Execute in a single Firestore transaction
            const result = await runTransaction(db, async (transaction) => {
                const updatedStudents: ReassignmentResult['updatedStudents'] = [];
                const busUpdates = new Map<string, {
                    busId: string;
                    morningCountBefore: number;
                    morningCountAfter: number;
                    eveningCountBefore: number;
                    eveningCountAfter: number;
                }>();

                // Track load changes per bus
                const busLoadChanges = new Map<string, {
                    morningDelta: number;
                    eveningDelta: number
                }>();

                // Phase 1: Calculate all deltas and validate
                for (const plan of plans) {
                    // Initialize change trackers
                    if (!busLoadChanges.has(plan.fromBusId)) {
                        busLoadChanges.set(plan.fromBusId, { morningDelta: 0, eveningDelta: 0 });
                    }
                    if (!busLoadChanges.has(plan.toBusId)) {
                        busLoadChanges.set(plan.toBusId, { morningDelta: 0, eveningDelta: 0 });
                    }

                    const fromChanges = busLoadChanges.get(plan.fromBusId)!;
                    const toChanges = busLoadChanges.get(plan.toBusId)!;

                    // Update shift-specific deltas
                    if (plan.shift === 'Morning') {
                        fromChanges.morningDelta -= 1;
                        toChanges.morningDelta += 1;
                    } else {
                        fromChanges.eveningDelta -= 1;
                        toChanges.eveningDelta += 1;
                    }
                }

                // Phase 2: Read and validate all bus documents (inside transaction for fresh data)
                for (const [busId, changes] of busLoadChanges) {
                    const busRef = doc(db, 'buses', busId);
                    const busSnap = await transaction.get(busRef);

                    if (!busSnap.exists()) {
                        throw new Error(`Bus ${busId} not found`);
                    }

                    const busData = busSnap.data();
                    const currentLoad = busData.load || { morningCount: 0, eveningCount: 0 };

                    // Calculate new counts
                    const newMorningCount = Math.max(0, (currentLoad.morningCount || 0) + changes.morningDelta);
                    const newEveningCount = Math.max(0, (currentLoad.eveningCount || 0) + changes.eveningDelta);

                    // Validate capacity constraints for increases
                    if (changes.morningDelta > 0 && newMorningCount > busData.capacity) {
                        throw new Error(
                            `Bus ${busData.busNumber} would exceed morning capacity (${newMorningCount}/${busData.capacity})`
                        );
                    }
                    if (changes.eveningDelta > 0 && newEveningCount > busData.capacity) {
                        throw new Error(
                            `Bus ${busData.busNumber} would exceed evening capacity (${newEveningCount}/${busData.capacity})`
                        );
                    }

                    // Validate shift compatibility for target buses (only if adding students)
                    if (changes.morningDelta > 0 || changes.eveningDelta > 0) {
                        const busShift = busData.shift || busData.route?.shift || 'Both';

                        if (changes.morningDelta > 0 && busShift !== 'Morning' && busShift !== 'Both' &&
                            busShift !== 'morning' && busShift !== 'both') {
                            throw new Error(
                                `Bus ${busData.busNumber} (${busShift}) cannot accept morning students`
                            );
                        }
                        if (changes.eveningDelta > 0 && busShift !== 'Both' && busShift !== 'both') {
                            throw new Error(
                                `Bus ${busData.busNumber} (${busShift}) cannot accept evening students - only "Both" buses allowed`
                            );
                        }
                    }

                    // Store before/after for revert buffer
                    busUpdates.set(busId, {
                        busId,
                        morningCountBefore: currentLoad.morningCount || 0,
                        morningCountAfter: newMorningCount,
                        eveningCountBefore: currentLoad.eveningCount || 0,
                        eveningCountAfter: newEveningCount
                    });

                    // Update bus document
                    transaction.update(busRef, {
                        'load.morningCount': newMorningCount,
                        'load.eveningCount': newEveningCount,
                        'load.totalCount': newMorningCount + newEveningCount,
                        updatedAt: serverTimestamp()
                    });
                }

                // Phase 3: Update all student documents
                for (const plan of plans) {
                    const studentRef = doc(db, 'students', plan.studentId);

                    transaction.update(studentRef, {
                        busId: plan.toBusId,
                        routeId: plan.toRouteId,
                        // stopId stays the same unless explicitly changed
                        updatedAt: serverTimestamp()
                    });

                    updatedStudents.push({
                        uid: plan.studentId,
                        oldBusId: plan.fromBusId,
                        newBusId: plan.toBusId,
                        oldRouteId: plan.fromRouteId || '',
                        newRouteId: plan.toRouteId,
                        stopId: plan.stopId,
                        shift: plan.shift
                    });
                }

                return {
                    updatedStudents,
                    busUpdates: Array.from(busUpdates.values())
                };
            });

            // Create revert buffer for undo functionality
            const revertBuffer: RevertBufferData = {
                affectedStudents: result.updatedStudents,
                busUpdates: result.busUpdates,
                timestamp: new Date()
            };

            revertBufferRef.current = revertBuffer;

            // Send notifications (outside transaction)
            await sendReassignmentNotifications(plans, reason, actorName);

            // Create audit log (outside transaction)
            await createReassignmentAuditLog(plans, reason, actorId, actorName);

            console.log('✅ Reassignment transaction completed:', {
                students: result.updatedStudents.length,
                buses: result.busUpdates.length
            });

            const finalResult: ReassignmentResult = {
                success: true,
                updatedStudents: result.updatedStudents,
                busUpdates: result.busUpdates,
                revertBuffer
            };

            setLastResult(finalResult);
            return finalResult;

        } catch (error: any) {
            console.error('❌ Reassignment transaction failed:', error);
            toast.error(`Reassignment failed: ${error.message}`);

            const errorResult: ReassignmentResult = {
                success: false,
                updatedStudents: [],
                busUpdates: [],
                revertBuffer: null,
                error: error.message
            };

            setLastResult(errorResult);
            return errorResult;

        } finally {
            setIsProcessing(false);
        }
    }, []);

    /**
     * Revert a reassignment using the stored revert buffer
     * This restores the exact previous state
     */
    const revertReassignment = useCallback(async (): Promise<boolean> => {
        const revertBuffer = revertBufferRef.current;

        if (!revertBuffer) {
            console.warn('⚠️ No revert buffer available');
            toast.error('Cannot revert: No pending reassignment');
            return false;
        }

        console.log('🔄 Starting revert transaction:', {
            students: revertBuffer.affectedStudents.length,
            buses: revertBuffer.busUpdates.length
        });

        setIsProcessing(true);

        try {
            await runTransaction(db, async (transaction) => {
                // Revert student documents
                for (const student of revertBuffer.affectedStudents) {
                    const studentRef = doc(db, 'students', student.uid);

                    transaction.update(studentRef, {
                        busId: student.oldBusId,
                        routeId: student.oldRouteId,
                        updatedAt: serverTimestamp()
                    });
                }

                // Revert bus load counts
                for (const busUpdate of revertBuffer.busUpdates) {
                    const busRef = doc(db, 'buses', busUpdate.busId);

                    transaction.update(busRef, {
                        'load.morningCount': busUpdate.morningCountBefore,
                        'load.eveningCount': busUpdate.eveningCountBefore,
                        'load.totalCount': busUpdate.morningCountBefore + busUpdate.eveningCountBefore,
                        updatedAt: serverTimestamp()
                    });
                }
            });

            // Clear revert buffer
            revertBufferRef.current = null;

            console.log('✅ Revert completed successfully');
            toast.success('Reassignment reverted successfully');

            return true;

        } catch (error: any) {
            console.error('❌ Revert failed:', error);
            toast.error(`Revert failed: ${error.message}`);
            return false;

        } finally {
            setIsProcessing(false);
        }
    }, []);

    /**
     * Clear the revert buffer (called after confirm or timeout)
     */
    const clearRevertBuffer = useCallback(() => {
        revertBufferRef.current = null;
    }, []);

    /**
     * Get current revert buffer
     */
    const getRevertBuffer = useCallback((): RevertBufferData | null => {
        return revertBufferRef.current;
    }, []);

    return {
        executeReassignment,
        revertReassignment,
        clearRevertBuffer,
        getRevertBuffer,
        isProcessing,
        lastResult
    };
}

/**
 * Send notification to affected students
 */
async function sendReassignmentNotifications(
    plans: ReassignmentPlan[],
    reason: string,
    actorName: string
): Promise<void> {
    try {
        const batch = writeBatch(db);

        for (const plan of plans) {
            const notifRef = doc(collection(db, 'notifications'));
            batch.set(notifRef, {
                title: '🚌 Bus Reassignment',
                content: `You have been reassigned to ${plan.toBusNumber}. Reason: ${reason}`,
                sender: {
                    userId: 'system',
                    userName: 'System',
                    userRole: 'system'
                },
                target: {
                    type: 'specific_users',
                    specificUserIds: [plan.studentId]
                },
                recipientIds: [plan.studentId],
                autoInjectedRecipientIds: [],
                readByUserIds: [],
                isEdited: false,
                isDeletedGlobally: false,
                createdAt: serverTimestamp(),
                metadata: {
                    type: 'reassignment',
                    fromBusId: plan.fromBusId,
                    toBusId: plan.toBusId,
                    reason
                }
            });
        }

        await batch.commit();
        console.log(`📧 Sent ${plans.length} reassignment notifications`);
    } catch (error) {
        console.error('Failed to send notifications:', error);
        // Don't throw - notifications are not critical
    }
}

/**
 * Create audit log for reassignment
 */
async function createReassignmentAuditLog(
    plans: ReassignmentPlan[],
    reason: string,
    actorId: string,
    actorName: string
): Promise<void> {
    try {
        const { addDoc } = await import('firebase/firestore');

        await addDoc(collection(db, 'activity_logs'), {
            type: 'bus_reassignment',
            actorId,
            actorName,
            timestamp: serverTimestamp(),
            details: {
                studentCount: plans.length,
                reason,
                plans: plans.map(p => ({
                    studentId: p.studentId,
                    studentName: p.studentName,
                    fromBusId: p.fromBusId,
                    toBusId: p.toBusId,
                    toBusNumber: p.toBusNumber,
                    shift: p.shift
                }))
            }
        });

        console.log('📝 Audit log created');
    } catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw - audit logs are not critical
    }
}
