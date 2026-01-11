/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚌 SMART BUS REASSIGNMENT SERVICE V2.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL FIX: Per-Shift Overload Calculation
 * 
 * PROBLEM (OLD):
 * - Buses with shift="Both" counted all students together
 * - This is WRONG: morning and evening students travel at different times!
 * 
 * SOLUTION (NEW):
 * - Track morningCount and eveningCount separately
 * - For "Both" buses: overload if EITHER exceeds capacity
 * - Check seat availability per-shift
 * 
 * OVERLOAD RULES:
 * - shift="Morning": overload if morningCount > capacity
 * - shift="Evening": overload if eveningCount > capacity
 * - shift="Both": overload if morningCount > capacity OR eveningCount > capacity
 * 
 * EXAMPLE:
 * Bus A (shift="Both", capacity=50):
 *   morningCount=40, eveningCount=35
 *   → NOT overloaded (each shift fits within capacity)
 * 
 * Bus B (shift="Both", capacity=50):
 *   morningCount=55, eveningCount=30
 *   → OVERLOADED (morning exceeds capacity)
 * 
 * @author AI Code Editor
 * @version 2.0.0
 * @date 2025-01-19
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use client';

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  Timestamp,
  Transaction,
  limit
} from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { toast } from 'react-hot-toast';
import { ChangeRecord } from './reassignment-logs-supabase';

// ============================================
// HELPER: Write to Supabase via API route
// ============================================

async function writeToSupabaseViaAPI(payload: {
  operationId: string;
  type: string;
  actorId: string;
  actorLabel: string;
  status: string;
  summary: string;
  changes: ChangeRecord[];
  meta: Record<string, any>;
}): Promise<boolean> {
  // console.log('[writeToSupabaseViaAPI] 🚀 Writing to Supabase...');

  try {
    // Get current user token
    const user = auth.currentUser;
    if (!user) {
      console.error('[writeToSupabaseViaAPI] ❌ No authenticated user');
      return false;
    }

    const token = await user.getIdToken();

    // Use the correct endpoint
    const response = await fetch('/api/reassignment-logs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[writeToSupabaseViaAPI] ❌ API error:', result.error);
      return false;
    }

    // console.log('[writeToSupabaseViaAPI] ✅ SUCCESS - Log ID:', result.data?.id);
    return true;
  } catch (err: any) {
    console.error('[writeToSupabaseViaAPI] ❌ Exception:', err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type StudentShift = 'Morning' | 'Evening';
export type BusShift = 'Morning' | 'Evening' | 'Both';

/**
 * Per-shift load tracking for buses
 * CRITICAL: This enables correct overload calculation
 */
export interface BusLoad {
  morningCount: number;
  eveningCount: number;
  totalCount?: number; // Optional, for backward compatibility
}

/**
 * Stop information
 */
export interface Stop {
  id?: string;
  stopId?: string;
  name: string;
  sequence: number;
}

/**
 * Bus data with per-shift load tracking
 */
export interface BusData {
  id: string;
  busNumber: string;
  capacity: number;
  route: {
    routeId: string;
    routeName: string;
    shift: BusShift;
    stops: Stop[];
  };
  routeId: string; // Direct property for compatibility
  routeName: string; // Direct property for compatibility
  shift: BusShift;
  stops: Stop[]; // Direct property for compatibility
  load: BusLoad; // NEW: Per-shift counts
  activeDriverId?: string;
  assignedDriverId?: string;
}

/**
 * Student data
 */
export interface StudentData {
  id: string; // uid
  fullName: string;
  busId: string;
  routeId: string;
  stopId: string;
  shift: StudentShift;
  status: 'active' | 'inactive';
  validUntil?: Timestamp;
}

/**
 * Reassignment plan
 */
export interface ReassignmentPlan {
  studentId: string;
  studentName: string;
  fromBusId: string;
  fromRouteId: string;
  toBusId: string;
  toRouteId: string;
  toBusNumber: string;
  stopId: string;
  shift: StudentShift;
}

/**
 * Bus update tracking
 */
export interface BusUpdate {
  busId: string;
  morningCountBefore: number;
  morningCountAfter: number;
  eveningCountBefore: number;
  eveningCountAfter: number;
}

/**
 * Overload information
 */
export interface OverloadInfo {
  busId: string;
  busNumber: string;
  reason: 'morning' | 'evening' | 'both';
  count: number;
  capacity: number;
  shift: BusShift;
}

/**
 * Reassignment result
 */
export interface ReassignmentResult {
  success: boolean;
  updatedStudents: Array<{
    uid: string;
    oldBusId: string;
    newBusId: string;
    oldRouteId: string;
    newRouteId: string;
    stopId: string;
  }>;
  busUpdates: BusUpdate[];
  summary: {
    overloadedBefore: OverloadInfo[];
    overloadedAfter: OverloadInfo[];
    movedCount: number;
    affectedStops: string[];
    warnings: string[];
  };
  error?: string;
}

/**
 * Candidate bus for suggestions
 */
export interface CandidateBus {
  bus: BusData;
  score: number;
  availableSeatsForMorning: number;
  availableSeatsForEvening: number;
  currentLoadMorning: number;
  currentLoadEvening: number;
  finalLoadMorning: number;
  finalLoadEvening: number;
  servesAllStops: boolean;
  shiftCompatible: boolean;
  matchedStops: string[];
  reason: string;
}

/**
 * Split assignment
 */
export interface SplitAssignment {
  busId: string;
  busNumber: string;
  students: StudentData[];
  shift: StudentShift;
  loadBeforeShift: number;
  loadAfterShift: number;
  finalLoadPercentage: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - SHIFT COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check student-bus shift compatibility
 * 
 * RULES:
 * - Morning student → Morning OR Both bus ✓
 * - Evening student → Both bus ONLY ✓
 */
export function isShiftCompatible(studentShift: StudentShift, busShift: BusShift): boolean {
  if (studentShift === 'Morning') {
    return busShift === 'Morning' || busShift === 'Both';
  }

  if (studentShift === 'Evening') {
    return busShift === 'Both'; // Evening students can ONLY go to Both buses
  }

  return false;
}

/**
 * Check if bus route contains stop
 */
export function busHasStop(bus: BusData, stopId: string): boolean {
  const stops = bus.route?.stops || [];
  return stops.some(stop => {
    const busStopId = stop.stopId || stop.id || '';
    return busStopId.toLowerCase() === stopId.toLowerCase();
  });
}

/**
 * Check if bus serves all required stops
 */
export function busServesAllStops(bus: BusData, stopIds: string[]): boolean {
  return stopIds.every(stopId => busHasStop(bus, stopId));
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLOAD CALCULATION - CORE LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate if bus is overloaded (PER-SHIFT LOGIC)
 * 
 * CRITICAL RULES:
 * - shift="Morning": overload if morningCount > capacity
 * - shift="Evening": overload if eveningCount > capacity
 * - shift="Both": overload if morningCount > capacity OR eveningCount > capacity
 * 
 * @returns OverloadInfo if overloaded, null otherwise
 */
export function checkOverload(bus: BusData): OverloadInfo | null {
  const { morningCount = 0, eveningCount = 0 } = bus.load || {};

  if (bus.shift === 'Morning') {
    if (morningCount > bus.capacity) {
      return {
        busId: bus.id,
        busNumber: bus.busNumber,
        reason: 'morning',
        count: morningCount,
        capacity: bus.capacity,
        shift: bus.shift
      };
    }
  }

  if (bus.shift === 'Evening') {
    if (eveningCount > bus.capacity) {
      return {
        busId: bus.id,
        busNumber: bus.busNumber,
        reason: 'evening',
        count: eveningCount,
        capacity: bus.capacity,
        shift: bus.shift
      };
    }
  }

  if (bus.shift === 'Both') {
    const morningOverload = morningCount > bus.capacity;
    const eveningOverload = eveningCount > bus.capacity;

    if (morningOverload && eveningOverload) {
      return {
        busId: bus.id,
        busNumber: bus.busNumber,
        reason: 'both',
        count: Math.max(morningCount, eveningCount),
        capacity: bus.capacity,
        shift: bus.shift
      };
    } else if (morningOverload) {
      return {
        busId: bus.id,
        busNumber: bus.busNumber,
        reason: 'morning',
        count: morningCount,
        capacity: bus.capacity,
        shift: bus.shift
      };
    } else if (eveningOverload) {
      return {
        busId: bus.id,
        busNumber: bus.busNumber,
        reason: 'evening',
        count: eveningCount,
        capacity: bus.capacity,
        shift: bus.shift
      };
    }
  }

  return null;
}

/**
 * Get available seats for specific shift
 */
export function getAvailableSeatsForShift(bus: BusData, shift: StudentShift): number {
  const { morningCount = 0, eveningCount = 0 } = bus.load || {};

  if (shift === 'Morning') {
    return bus.capacity - morningCount;
  } else {
    return bus.capacity - eveningCount;
  }
}

/**
 * Calculate load percentage for specific shift
 */
export function calculateShiftLoad(bus: BusData, shift: StudentShift): number {
  const { morningCount = 0, eveningCount = 0 } = bus.load || {};
  const count = shift === 'Morning' ? morningCount : eveningCount;
  return (count / bus.capacity) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class BusReassignmentServiceV2 {

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * 1. MANUAL REASSIGNMENT (Select & Move)
   * ═══════════════════════════════════════════════════════════════════════
   */
  async executeManualReassignment(
    plans: ReassignmentPlan[],
    reason: string,
    actorId: string,
    actorName: string
  ): Promise<ReassignmentResult> {
    console.log('🚀 Manual reassignment started:', {
      count: plans.length,
      reason,
      actor: actorName
    });

    try {
      // Validate plans
      this.validatePlans(plans);

      // Group plans by shift for per-shift processing
      const morningPlans = plans.filter(p => p.shift === 'Morning');
      const eveningPlans = plans.filter(p => p.shift === 'Evening');

      console.log('📊 Plan breakdown:', {
        morning: morningPlans.length,
        evening: eveningPlans.length
      });

      // Execute in transaction
      const result = await runTransaction(db, async (transaction) => {
        const updatedStudents: any[] = [];
        const busUpdates = new Map<string, BusUpdate>();
        const affectedStops = new Set<string>();
        const warnings: string[] = [];

        // Calculate per-shift changes for each bus
        const busShiftChanges = new Map<string, { morningDelta: number; eveningDelta: number }>();
        // Captured bus numbers for audit logging
        const busNumberMap = new Map<string, string>();

        for (const plan of plans) {
          // Get or create change tracker for this bus
          if (!busShiftChanges.has(plan.fromBusId)) {
            busShiftChanges.set(plan.fromBusId, { morningDelta: 0, eveningDelta: 0 });
          }
          if (!busShiftChanges.has(plan.toBusId)) {
            busShiftChanges.set(plan.toBusId, { morningDelta: 0, eveningDelta: 0 });
          }

          const fromChanges = busShiftChanges.get(plan.fromBusId)!;
          const toChanges = busShiftChanges.get(plan.toBusId)!;

          // Update shift-specific deltas
          if (plan.shift === 'Morning') {
            fromChanges.morningDelta -= 1;
            toChanges.morningDelta += 1;
          } else {
            fromChanges.eveningDelta -= 1;
            toChanges.eveningDelta += 1;
          }
        }

        // Validate and update buses
        for (const [busId, changes] of busShiftChanges) {
          const busRef = doc(db, 'buses', busId);
          const busSnap = await transaction.get(busRef);

          if (!busSnap.exists()) {
            throw new Error(`Bus ${busId} not found`);
          }

          const busData = busSnap.data();
          const currentLoad = busData.load || { morningCount: 0, eveningCount: 0 };

          const newMorningCount = Math.max(0, (currentLoad.morningCount || 0) + changes.morningDelta);
          const newEveningCount = Math.max(0, (currentLoad.eveningCount || 0) + changes.eveningDelta);

          // Check capacity constraints
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

          // Update bus load
          transaction.update(busRef, {
            'load.morningCount': newMorningCount,
            'load.eveningCount': newEveningCount,
            updatedAt: serverTimestamp()
          });

          // Capture bus number for logging
          busNumberMap.set(busId, busData.busNumber || 'Unknown');

          busUpdates.set(busId, {
            busId,
            morningCountBefore: currentLoad.morningCount || 0,
            morningCountAfter: newMorningCount,
            eveningCountBefore: currentLoad.eveningCount || 0,
            eveningCountAfter: newEveningCount
          });
        }

        // Update students with PRE-READ for accurate rollback log
        for (const plan of plans) {
          const studentRef = doc(db, 'students', plan.studentId);
          const studentSnap = await transaction.get(studentRef);

          if (!studentSnap.exists()) continue;

          const studentData = studentSnap.data();
          const beforeState = {
            busId: studentData.busId,
            routeId: studentData.routeId,
            stopId: studentData.stopId,
            shift: studentData.shift,
            assignedBusId: studentData.assignedBusId // Capture legacy field
          };

          // Update both busId and assignedBusId for consistency
          transaction.update(studentRef, {
            busId: plan.toBusId,
            assignedBusId: plan.toBusId, // Sync legacy field
            routeId: plan.toRouteId,
            stopId: plan.stopId,
            updatedAt: serverTimestamp()
          });

          updatedStudents.push({
            uid: plan.studentId,
            oldBusId: beforeState.busId, // Use actual DB state
            newBusId: plan.toBusId,
            oldRouteId: beforeState.routeId,
            newRouteId: plan.toRouteId,
            stopId: plan.stopId,
            beforeState, // Pass full before state to log
          });

          affectedStops.add(plan.stopId);
        }

        return {
          updatedStudents,
          busUpdates: Array.from(busUpdates.values()),
          busNumberMap, // Pass map out of transaction result
          affectedStops: Array.from(affectedStops),
          warnings
        };
      });

      // Send notifications
      await this.sendNotifications(plans, reason, actorName);

      // Create audit log (Supabase)
      await this.createAuditLog(
        plans,
        reason,
        actorId,
        actorName,
        result.busUpdates,
        result.updatedStudents,
        result.busNumberMap // NEW ARGUMENT
      );

      console.log('✅ Manual reassignment completed');

      return {
        success: true,
        updatedStudents: result.updatedStudents,
        busUpdates: result.busUpdates,
        summary: {
          overloadedBefore: [], // Would need to track this
          overloadedAfter: [],  // Would need to track this
          movedCount: plans.length,
          affectedStops: result.affectedStops,
          warnings: result.warnings
        }
      };

    } catch (error: any) {
      console.error('❌ Manual reassignment failed:', error);
      toast.error(`Reassignment failed: ${error.message}`);

      return {
        success: false,
        updatedStudents: [],
        busUpdates: [],
        summary: {
          overloadedBefore: [],
          overloadedAfter: [],
          movedCount: 0,
          affectedStops: [],
          warnings: []
        },
        error: error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * 2. AUTO-SUGGEST (Per-Shift Availability)
   * ═══════════════════════════════════════════════════════════════════════
   */
  async autoSuggest(
    selectedStudents: StudentData[],
    allBuses: BusData[],
    currentBus: BusData,
    threshold: number = 90
  ): Promise<CandidateBus[]> {
    console.log('🔍 Auto-suggest with per-shift logic:', {
      students: selectedStudents.length,
      threshold
    });

    // Group students by shift
    const morningStudents = selectedStudents.filter(s => s.shift === 'Morning');
    const eveningStudents = selectedStudents.filter(s => s.shift === 'Evening');

    console.log('📊 Student breakdown:', {
      morning: morningStudents.length,
      evening: eveningStudents.length
    });

    // Get required stops
    const requiredStops = [...new Set(selectedStudents.map(s => s.stopId))];

    // Filter compatible buses
    const candidates = allBuses.filter(bus => {
      // Exclude current bus
      if (bus.id === currentBus.id) return false;

      // Check stop coverage
      if (!busServesAllStops(bus, requiredStops)) return false;

      // Check shift compatibility
      const canTakeMorning = morningStudents.length === 0 ||
        (bus.shift === 'Morning' || bus.shift === 'Both');
      const canTakeEvening = eveningStudents.length === 0 ||
        (bus.shift === 'Both');

      if (!canTakeMorning || !canTakeEvening) return false;

      // Check per-shift availability
      if (morningStudents.length > 0) {
        const freeForMorning = getAvailableSeatsForShift(bus, 'Morning');
        if (freeForMorning < morningStudents.length) return false;
      }

      if (eveningStudents.length > 0) {
        const freeForEvening = getAvailableSeatsForShift(bus, 'Evening');
        if (freeForEvening < eveningStudents.length) return false;
      }

      // Check threshold constraint
      const finalMorningLoad = calculateShiftLoad(bus, 'Morning') +
        ((morningStudents.length / bus.capacity) * 100);
      const finalEveningLoad = calculateShiftLoad(bus, 'Evening') +
        ((eveningStudents.length / bus.capacity) * 100);

      if (finalMorningLoad > threshold || finalEveningLoad > threshold) {
        return false;
      }

      return true;
    });

    console.log('Found', candidates.length, 'compatible buses');

    // Rank candidates
    const ranked = candidates.map(bus => {
      const currentMorningLoad = calculateShiftLoad(bus, 'Morning');
      const currentEveningLoad = calculateShiftLoad(bus, 'Evening');

      const finalMorningLoad = currentMorningLoad +
        ((morningStudents.length / bus.capacity) * 100);
      const finalEveningLoad = currentEveningLoad +
        ((eveningStudents.length / bus.capacity) * 100);

      // Scoring factors
      const stopCoverage = requiredStops.length / (bus.route?.stops?.length || 1);
      const avgFinalLoad = (finalMorningLoad + finalEveningLoad) / 2;
      const loadScore = 1 - (avgFinalLoad / 100);

      const score = (stopCoverage * 0.4) + (loadScore * 0.6);

      return {
        bus,
        score,
        availableSeatsForMorning: getAvailableSeatsForShift(bus, 'Morning'),
        availableSeatsForEvening: getAvailableSeatsForShift(bus, 'Evening'),
        currentLoadMorning: currentMorningLoad,
        currentLoadEvening: currentEveningLoad,
        finalLoadMorning: finalMorningLoad,
        finalLoadEvening: finalEveningLoad,
        servesAllStops: true,
        shiftCompatible: true,
        matchedStops: requiredStops,
        reason: `Score: ${(score * 100).toFixed(0)}/100 | Morning: ${currentMorningLoad.toFixed(0)}% → ${finalMorningLoad.toFixed(0)}% | Evening: ${currentEveningLoad.toFixed(0)}% → ${finalEveningLoad.toFixed(0)}%`
      };
    });

    // Sort by score
    ranked.sort((a, b) => b.score - a.score);

    console.log('✅ Auto-suggest complete');

    return ranked;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * 3. AUTO-SPLIT (Enhanced - Independent Stop-Group Allocation)
   * ═══════════════════════════════════════════════════════════════════════
   * 
   * This method now delegates to the enhanced AutoSplitService which provides:
   * - Independent stop-group allocation
   * - Per-shift seat management
   * - Multi-bus distribution
   * - Optional randomization for load balancing
   * - Transaction-safe execution
   * - Proper handling of unassignable groups
   * 
   * For backward compatibility, this returns SplitAssignment[]
   * For the full enhanced API, use autoSplitService directly
   */
  async autoSplit(
    selectedStudents: StudentData[],
    allBuses: BusData[],
    currentBus: BusData,
    threshold: number = 90,
    options?: { randomize?: boolean; topN?: number }
  ): Promise<SplitAssignment[]> {
    console.log('⚡ Auto-split (Enhanced Mode) with per-shift groups');

    // Import the enhanced auto-split service
    const { autoSplitService } = await import('./auto-split-service');

    // Plan the auto-split
    const result = await autoSplitService.planAutoSplit(
      selectedStudents,
      allBuses,
      currentBus.id,
      {
        threshold,
        randomize: options?.randomize || false,
        topN: options?.topN || 3
      }
    );

    // Convert to legacy format for backward compatibility
    const assignments: SplitAssignment[] = result.plan.map(assignment => ({
      busId: assignment.assignedBus,
      busNumber: assignment.assignedBusNumber,
      students: assignment.students,
      shift: assignment.shift,
      loadBeforeShift: assignment.loadPercentageBefore,
      loadAfterShift: assignment.loadPercentageAfter,
      finalLoadPercentage: assignment.loadPercentageAfter
    }));

    // Log unassignable groups
    if (result.unassignable.length > 0) {
      console.warn('⚠️ Unassignable groups:', result.unassignable);
    }

    console.log('✅ Auto-split complete:', {
      assigned: assignments.length,
      unassigned: result.unassignable.length,
      students: result.summary.assignedStudents
    });

    return assignments;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * HELPER METHODS
   * ═══════════════════════════════════════════════════════════════════════
   */

  private validatePlans(plans: ReassignmentPlan[]): void {
    if (plans.length === 0) {
      throw new Error('NO_PLANS_PROVIDED');
    }

    const studentIds = new Set<string>();
    for (const plan of plans) {
      if (studentIds.has(plan.studentId)) {
        throw new Error('DUPLICATE_STUDENT_IN_PLANS');
      }
      studentIds.add(plan.studentId);

      if (!plan.studentId || !plan.toBusId || !plan.stopId) {
        throw new Error('INVALID_PLAN_MISSING_FIELDS');
      }
    }
  }

  private async sendNotifications(
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
      console.log('📧 Sent', plans.length, 'notifications');
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }
  }

  private async createAuditLog(
    plans: ReassignmentPlan[],
    reason: string,
    actorId: string,
    actorName: string,
    busUpdates: BusUpdate[],
    updatedStudents: any[],
    busNumberMap: Map<string, string> = new Map()
  ): Promise<void> {
    try {
      // 1. Log to Firestore (Legacy/Optional - removed per request to fix errors)
      /*
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
            toBus: p.toBusNumber
          }))
        }
      });
      */

      // 2. Log to Supabase (Primary)
      const operationId = `bus_reassignment_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const changes: ChangeRecord[] = [];

      // Add bus changes
      for (const update of busUpdates) {
        changes.push({
          docPath: `buses/${update.busId}`,
          collection: 'buses',
          docId: update.busId,
          before: {
            'load.morningCount': update.morningCountBefore,
            'load.eveningCount': update.eveningCountBefore,
            currentMembers: update.morningCountBefore + update.eveningCountBefore
          },
          after: {
            'load.morningCount': update.morningCountAfter,
            'load.eveningCount': update.eveningCountAfter,
            currentMembers: update.morningCountAfter + update.eveningCountAfter
          }
        });
      }

      // Add student changes
      for (const student of updatedStudents) {
        // Use captured beforeState or fallback to basic fields
        const before = student.beforeState || {
          busId: student.oldBusId,
          routeId: student.oldRouteId,
          shift: 'Morning', // Fallback
        };

        changes.push({
          docPath: `students/${student.uid}`,
          collection: 'students',
          docId: student.uid,
          before: {
            busId: before.busId,
            assignedBusId: before.assignedBusId || before.busId,
            routeId: before.routeId,
            stopId: before.stopId, // CRITICAL: Include stopId in before
            shift: before.shift
          },
          after: {
            busId: student.newBusId,
            assignedBusId: student.newBusId,
            routeId: student.newRouteId,
            stopId: student.stopId,
            shift: before.shift // Assume shift doesn't chang
          }
        });
      }

      // Construct descriptive summary with Bus Numbers
      let summary = `Reassigned ${plans.length} student(s)`;

      if (plans.length > 0) {
        // Collect unique source and dest generic names (e.g. bus_1) and full numbers
        const fromIds = [...new Set(plans.map(p => p.fromBusId))];
        const toIds = [...new Set(plans.map(p => p.toBusId))];

        const fromStr = fromIds.map(id => {
          const num = busNumberMap.get(id) || 'Unknown';
          // Format: "Bus-5 (AS-01-SC-1392)"
          const busIndex = id.replace(/[^0-9]/g, '') || '?';
          return `Bus-${busIndex} (${num})`;
        }).join(', ');

        const toStr = toIds.map(id => {
          const num = busNumberMap.get(id) || plans.find(p => p.toBusId === id)?.toBusNumber || 'Unknown';
          const busIndex = id.replace(/[^0-9]/g, '') || '?';
          return `Bus-${busIndex} (${num})`;
        }).join(', ');

        if (fromIds.length <= 2 && toIds.length <= 2) {
          summary += ` from ${fromStr} to ${toStr}`;
        } else {
          summary += ` from [${fromIds.length} buses] to [${toIds.length} buses]`;
        }
      }

      await writeToSupabaseViaAPI({
        operationId,
        type: 'route_reassignment', // Using route_reassignment as a generic bus reassignment type
        actorId,
        actorLabel: actorName,
        status: 'committed',
        summary, // Use our constructed summary
        changes,
        meta: {
          studentCount: plans.length,
          reason,
          // Store raw map just in case
          fromBusNumbers: Object.fromEntries(busNumberMap),
          busUpdates,
          // Store descriptive info in meta for UI to reconstruct if needed
          details: plans.map(p => ({
            studentId: p.studentId,
            fromBusId: p.fromBusId,
            toBusId: p.toBusId,
            toBusNumber: p.toBusNumber
          }))
        }
      });

      console.log('✅ Audit log created');
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * RECONCILIATION - Fix inconsistent load counts
   * ═══════════════════════════════════════════════════════════════════════
   */
  async reconcileBusLoads(busIds?: string[]): Promise<Map<string, BusLoad>> {
    console.log('🔧 Reconciling bus load counts...');

    const results = new Map<string, BusLoad>();

    try {
      // Get all buses or specific buses
      let busesToReconcile: BusData[];

      if (busIds && busIds.length > 0) {
        busesToReconcile = [];
        for (const busId of busIds) {
          const busDoc = await getDoc(doc(db, 'buses', busId));
          if (busDoc.exists()) {
            busesToReconcile.push({ id: busDoc.id, ...busDoc.data() } as BusData);
          }
        }
      } else {
        const busesSnap = await getDocs(collection(db, 'buses'));
        busesToReconcile = busesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BusData));
      }

      console.log('Reconciling', busesToReconcile.length, 'buses');

      for (const bus of busesToReconcile) {
        // Count students by shift
        const studentsQuery = query(
          collection(db, 'students'),
          where('busId', '==', bus.id),
          where('status', '==', 'active')
        );

        const studentsSnap = await getDocs(studentsQuery);

        let morningCount = 0;
        let eveningCount = 0;

        studentsSnap.forEach(doc => {
          const student = doc.data();
          if (student.shift === 'Morning') {
            morningCount++;
          } else if (student.shift === 'Evening') {
            eveningCount++;
          }
        });

        // Update bus document
        await runTransaction(db, async (transaction) => {
          const busRef = doc(db, 'buses', bus.id);
          transaction.update(busRef, {
            'load.morningCount': morningCount,
            'load.eveningCount': eveningCount,
            'load.totalCount': morningCount + eveningCount,
            updatedAt: serverTimestamp()
          });
        });

        results.set(bus.id, {
          morningCount,
          eveningCount,
          totalCount: morningCount + eveningCount
        });

        console.log(`✓ ${bus.busNumber}: M=${morningCount}, E=${eveningCount}`);
      }

      console.log('✅ Reconciliation complete');
      return results;

    } catch (error: any) {
      console.error('❌ Reconciliation failed:', error);
      throw error;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const busReassignmentService = new BusReassignmentServiceV2();
