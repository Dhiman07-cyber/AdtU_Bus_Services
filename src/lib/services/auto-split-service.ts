/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTO-SPLIT SERVICE - Enhanced Edition
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 * Distribute students across multiple buses based on per-stop-group allocation.
 * Each stop-group is assigned INDEPENDENTLY to the best available compatible bus.
 *
 * KEY DIFFERENCES FROM AUTO-SUGGEST:
 * ┌─────────────────┬──────────────────────────────────────────────────────┐
 * │ AUTO-SUGGEST    │ Find ONE bus that supports ALL selected stops       │
 * │ AUTO-SPLIT      │ Assign EACH stop-group to its own best bus          │
 * └─────────────────┴──────────────────────────────────────────────────────┘
 *
 * CORE PRINCIPLES:
 * 1. Group students by (stopId, shift)
 * 2. For each group, find compatible buses independently
 * 3. Score buses by free seats, load percentage, and route distance
 * 4. Assign all students of a stop-group to the best bus
 * 5. Use Firestore transactions for atomicity
 * 6. Handle unassignable groups gracefully
 *
 * @author DHIMAN SAIKIA
 * @version 3.0.0
 * @date 2025-11-20
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use client";

import { db } from "@/lib/firebase";
import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Transaction,
} from "firebase/firestore";
import { toast } from "react-hot-toast";

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Student shift type
 */
export type StudentShift = "Morning" | "Evening";

/**
 * Bus shift type
 */
export type BusShift = "Morning" | "Evening" | "Both";

/**
 * Per-shift load tracking for buses
 */
export interface BusLoad {
  morningCount: number;
  eveningCount: number;
  totalCount?: number;
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
 * Bus data with routes and load tracking
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
  routeId: string;
  routeName: string;
  shift: BusShift;
  stops: Stop[];
  load: BusLoad;
  activeDriverId?: string;
  assignedDriverId?: string;
}

/**
 * Student data
 */
export interface StudentData {
  id: string;
  uid?: string;
  fullName: string;
  busId: string;
  routeId: string;
  stopId: string;
  shift: StudentShift;
  status: "active" | "inactive";
  validUntil?: Timestamp;
}

/**
 * Stop-group: students grouped by (stopId, shift)
 */
export interface StopGroup {
  stopId: string;
  shift: StudentShift;
  students: StudentData[];
  count: number;
}

/**
 * Candidate bus for a stop-group
 */
export interface CandidateBus {
  bus: BusData;
  score: number;
  freeSeatsForShift: number;
  loadPercentageBefore: number;
  loadPercentageAfter: number;
  reason: string;
}

/**
 * Assignment plan for a stop-group
 */
export interface StopGroupAssignment {
  stopId: string;
  stopName?: string;
  shift: StudentShift;
  studentCount: number;
  students: StudentData[];
  assignedBus: string;
  assignedBusNumber: string;
  assignedRoute: string;
  beforeLoad: {
    morning: number;
    evening: number;
  };
  afterLoad: {
    morning: number;
    evening: number;
  };
  loadPercentageBefore: number;
  loadPercentageAfter: number;
}

/**
 * Unassignable stop-group
 */
export interface UnassignableGroup {
  stopId: string;
  stopName?: string;
  shift: StudentShift;
  count: number;
  reason: string;
}

/**
 * AUTO-SPLIT result
 */
export interface AutoSplitResult {
  success: boolean;
  plan: StopGroupAssignment[];
  unassignable: UnassignableGroup[];
  summary: {
    totalGroups: number;
    assignedGroups: number;
    unassignedGroups: number;
    totalStudents: number;
    assignedStudents: number;
    unassignedStudents: number;
    affectedBuses: string[];
  };
  error?: string;
}

/**
 * AUTO-SPLIT execution result
 */
export interface AutoSplitExecutionResult {
  success: boolean;
  updatedStudents: Array<{
    uid: string;
    oldBusId: string;
    newBusId: string;
    oldRouteId: string;
    newRouteId: string;
    stopId: string;
    shift: StudentShift;
  }>;
  busUpdates: Array<{
    busId: string;
    busNumber: string;
    morningCountBefore: number;
    morningCountAfter: number;
    eveningCountBefore: number;
    eveningCountAfter: number;
  }>;
  summary: {
    movedCount: number;
    affectedBuses: number;
    affectedStops: string[];
  };
  error?: string;
}

/**
 * AUTO-SPLIT options
 */
export interface AutoSplitOptions {
  randomize?: boolean; // Randomize among top N candidates to distribute load
  topN?: number; // Number of top candidates to randomize from (default: 3)
  threshold?: number; // Maximum load percentage threshold (default: 90)
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group students by (stopId, shift)
 */
export function groupByStop(students: StudentData[]): StopGroup[] {
  const groups = new Map<string, StudentData[]>();

  students.forEach((student) => {
    const normalizedStopId = (student.stopId || "").trim().toLowerCase();
    // Normalize shift to Title Case
    const rawShift = student.shift || "Morning";
    const normalizedShift = (rawShift.charAt(0).toUpperCase() +
      rawShift.slice(1).toLowerCase()) as StudentShift;

    const key = `${normalizedStopId}|${normalizedShift}`;
    const group = groups.get(key) || [];
    group.push(student);
    groups.set(key, group);
  });

  return Array.from(groups.entries()).map(([key, students]) => {
    const parts = key.split("|");
    // Retrieve original-ish casing from the first student if possible, or TitleCase from normalized
    const firstStudent = students[0];
    const stopId = firstStudent.stopId || parts[0];
    const shift = parts[1] as StudentShift;

    return {
      stopId: stopId, // Keep original ID for display/matching if needed, but grouping was strict
      shift,
      students,
      count: students.length,
    };
  });
}

/**
 * Check shift compatibility
 *
 * RULES:
 * - Morning student → bus.shift ∈ ["Morning", "Both"] ✓
 * - Evening student → bus.shift == "Both" ONLY ✓
 */
export function isShiftCompatible(
  studentShift: StudentShift,
  busShift: BusShift,
): boolean {
  // Normalize both shifts for comparison
  const normalizedStudentShift = (studentShift || "Morning")
    .toLowerCase()
    .trim();
  const normalizedBusShift = (busShift || "morning").toLowerCase().trim();

  if (normalizedStudentShift === "morning") {
    return normalizedBusShift === "morning" || normalizedBusShift === "both";
  }

  if (normalizedStudentShift === "evening") {
    return normalizedBusShift === "both"; // Evening students can ONLY go to Both buses
  }

  return false;
}

/**
 * Extract the stopId from a stop object (handles various field names)
 * Priority: stopId > id > name
 */
function extractStopId(stop: any): string {
  if (!stop) return "";
  // Handle various field names that might contain the stop ID
  const id = stop.stopId || stop.id || stop.stop_id || stop.name || "";
  return (typeof id === "string" ? id : "").toLowerCase().trim();
}

/**
 * Check if bus has a specific stop
 * Checks both bus.route.stops and bus.stops arrays
 * Uses stopId field for matching (case-insensitive)
 *
 * IMPORTANT: In Firestore, stops are stored as:
 *   bus.route.stops[] = { name, sequence, stopId }
 *
 * In the UI (page.tsx), this is converted to:
 *   bus.stops[] = { id (from stopId), name, sequence }
 *
 * In ReassignmentPanel conversion:
 *   bus.stops[] = { stopId, id, name, sequence }
 */
export function busHasStop(bus: BusData, stopId: string): boolean {
  if (!stopId) {
    console.warn("⚠️ busHasStop called with empty stopId");
    return false;
  }

  const normalizedStopId = stopId.toLowerCase().trim();

  // Check route.stops first (this is the primary source)
  const routeStops = bus.route?.stops || [];
  const foundInRoute = routeStops.some((stop) => {
    const busStopId = extractStopId(stop);
    return busStopId === normalizedStopId;
  });

  if (foundInRoute) {
    return true;
  }

  // Also check direct stops array (this is what the UI uses)
  const directStops = bus.stops || [];
  const foundInDirect = directStops.some((stop) => {
    const busStopId = extractStopId(stop);
    return busStopId === normalizedStopId;
  });

  if (foundInDirect) {
    return true;
  }

  return false;
}

/**
 * Filter buses by shift compatibility
 */
export function filterByShift(
  buses: BusData[],
  shift: StudentShift,
): BusData[] {
  return buses.filter((bus) => isShiftCompatible(shift, bus.shift));
}

/**
 * Filter buses by stop coverage
 */
export function filterByStopCoverage(
  buses: BusData[],
  stopId: string,
): BusData[] {
  return buses.filter((bus) => busHasStop(bus, stopId));
}

/**
 * Compute free seats for a specific shift
 */
export function computeFreeSeats(bus: BusData, shift: StudentShift): number {
  const { morningCount = 0, eveningCount = 0 } = bus.load || {};

  if (shift === "Morning") {
    return bus.capacity - morningCount;
  } else {
    return bus.capacity - eveningCount;
  }
}

/**
 * Calculate load percentage for a specific shift
 */
export function calculateLoadPercentage(
  bus: BusData,
  shift: StudentShift,
): number {
  const { morningCount = 0, eveningCount = 0 } = bus.load || {};
  const count = shift === "Morning" ? morningCount : eveningCount;
  return (count / bus.capacity) * 100;
}

/**
 * Score candidate buses
 *
 * Scoring factors (enhanced):
 * 1. Free seats ratio (higher is better) - 35% weight
 * 2. Final load percentage (lower is better) - 30% weight
 * 3. Current load balance (lower is better) - 20% weight
 * 4. Capacity cushion after assignment - 15% weight
 *
 * @param buses - Candidate buses to score
 * @param shift - Student shift for seat calculation
 * @param groupSize - Number of students in the stop-group
 * @param originalBusId - Optional original bus ID for distance scoring
 */
export function scoreCandidateBuses(
  buses: BusData[],
  shift: StudentShift,
  groupSize: number,
  originalBusId?: string,
): CandidateBus[] {
  console.log(
    `📊 Scoring ${buses.length} candidate buses for ${groupSize} ${shift} students`,
  );

  return buses
    .map((bus) => {
      const freeSeats = computeFreeSeats(bus, shift);
      const loadBefore = calculateLoadPercentage(bus, shift);
      const loadAfter = loadBefore + (groupSize / bus.capacity) * 100;

      // Scoring factors (0-1 range)

      // 1. Free seats ratio - how much room is left after assignment
      const freeSeatsAfter = freeSeats - groupSize;
      const freeSeatsScore = Math.max(0, freeSeatsAfter / bus.capacity);

      // 2. Final load score - prefer buses that stay well under capacity
      const loadScore = Math.max(0, 1 - loadAfter / 100);

      // 3. Current balance score - prefer buses with lower current load
      const balanceScore = Math.max(0, 1 - loadBefore / 100);

      // 4. Capacity cushion - bonus for buses with large remaining capacity
      const cushionScore =
        freeSeatsAfter >= 10
          ? 1
          : freeSeatsAfter >= 5
            ? 0.7
            : freeSeatsAfter >= 2
              ? 0.4
              : 0.1;

      // Weighted total score
      const score =
        freeSeatsScore * 0.35 +
        loadScore * 0.3 +
        balanceScore * 0.2 +
        cushionScore * 0.15;

      const result: CandidateBus = {
        bus,
        score,
        freeSeatsForShift: freeSeats,
        loadPercentageBefore: loadBefore,
        loadPercentageAfter: loadAfter,
        reason: `Score: ${(score * 100).toFixed(0)}/100 | Load: ${loadBefore.toFixed(0)}% → ${loadAfter.toFixed(0)}% | Free: ${freeSeats} → ${freeSeatsAfter} seats`,
      };

      return result;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Randomize among top N candidates
 */
export function randomizeTopCandidates(
  candidates: CandidateBus[],
  topN: number = 3,
): CandidateBus | null {
  if (candidates.length === 0) return null;

  const topCandidates = candidates.slice(0, Math.min(topN, candidates.length));
  const randomIndex = Math.floor(Math.random() * topCandidates.length);
  return topCandidates[randomIndex];
}

/**
 * Title case helper for stop names
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get stop name from stopId with proper capitalization
 */
export function getStopName(bus: BusData, stopId: string): string | undefined {
  const stops = bus.route?.stops || [];
  const stop = stops.find((s) => {
    const busStopId = (s.stopId || s.id || "").toLowerCase().trim();
    return busStopId === stopId.toLowerCase().trim();
  });
  return stop?.name ? toTitleCase(stop.name) : toTitleCase(stopId);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AutoSplitService {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * AUTO-SPLIT PLANNING
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Generate an assignment plan for each stop-group independently
   */
  async planAutoSplit(
    selectedStudents: StudentData[],
    allBuses: BusData[],
    currentBusId: string,
    options: AutoSplitOptions = {},
  ): Promise<AutoSplitResult> {
    console.log("⚡ AUTO-SPLIT Planning Started", {
      students: selectedStudents.length,
      buses: allBuses.length,
      options,
    });

    // CRITICAL: Ensure threshold is sensible (never 0)
    const rawThreshold = options.threshold ?? 90;
    const threshold = rawThreshold > 0 ? rawThreshold : 100;
    const { randomize = false, topN = 3 } = options;

    console.log(`📋 AUTO-SPLIT Options:`, {
      randomize,
      topN,
      requestedThreshold: rawThreshold,
      effectiveThreshold: threshold,
    });

    if (rawThreshold === 0) {
      console.warn(
        `⚠️ Threshold was 0, using 100% instead (0% would reject all buses)`,
      );
    }

    try {
      // Step 1: Group students by (stopId, shift)
      const stopGroups = groupByStop(selectedStudents);
      console.log(
        `📊 Created ${stopGroups.length} stop-groups:`,
        stopGroups.map((g) => `${g.stopId} (${g.shift}): ${g.count} students`),
      );

      const plan: StopGroupAssignment[] = [];
      const unassignable: UnassignableGroup[] = [];
      const affectedBuses = new Set<string>();

      // Step 2: Process each stop-group independently
      for (const group of stopGroups) {
        const normalizedGroupStopId = (group.stopId || "").toLowerCase().trim();
        console.log(
          `\n🔍 Processing group: "${group.stopId}" (normalized: "${normalizedGroupStopId}") | Shift: ${group.shift} | ${group.count} students`,
        );

        // Debug: Log all available buses and their stops for this group
        console.log(
          `   📋 Checking ${allBuses.length} buses for stop "${normalizedGroupStopId}":`,
        );

        // Check each bus and log whether it has the stop
        const busMatchResults: {
          bus: BusData;
          hasStop: boolean;
          busStops: string[];
        }[] = [];
        allBuses.forEach((bus) => {
          const routeStops = (bus.route?.stops || []).map((s) =>
            extractStopId(s),
          );
          const directStops = (bus.stops || []).map((s) => extractStopId(s));
          const allBusStops = [...new Set([...routeStops, ...directStops])];
          const hasStop = allBusStops.includes(normalizedGroupStopId);
          busMatchResults.push({ bus, hasStop, busStops: allBusStops });
        });

        // Log first few buses with their match status
        busMatchResults.slice(0, 8).forEach(({ bus, hasStop, busStops }) => {
          const matchIcon = hasStop ? "✓" : "✗";
          console.log(
            `      ${matchIcon} ${bus.busNumber} (shift: ${bus.shift}): [${busStops.slice(0, 5).join(", ")}${busStops.length > 5 ? "..." : ""}]`,
          );
        });
        if (busMatchResults.length > 8) {
          console.log(`      ... and ${busMatchResults.length - 8} more buses`);
        }

        // 1. Find ALL buses that cover this stop (Stop Coverage)
        const busesWithStop = busMatchResults
          .filter((r) => r.hasStop)
          .map((r) => r.bus);
        console.log(
          `   → ${busesWithStop.length} buses cover stop "${normalizedGroupStopId}"${busesWithStop.length > 0 ? ": " + busesWithStop.map((b) => b.busNumber).join(", ") : " (NONE FOUND!)"}`,
        );

        // 2. Filter by Shift Compatibility
        let candidates = busesWithStop.filter((bus) => {
          const compatible = isShiftCompatible(group.shift, bus.shift);
          if (!compatible) {
            console.log(
              `   ✗ Bus ${bus.busNumber} shift "${bus.shift}" not compatible with student shift "${group.shift}"`,
            );
          }
          return compatible;
        });

        console.log(
          `   → ${candidates.length} buses match shift & stop${candidates.length > 0 ? ": " + candidates.map((b) => b.busNumber).join(", ") : ""}`,
        );

        // Check reasons for unassignability BEFORE filtering by capacity/threshold
        if (candidates.length === 0) {
          const stopName =
            getStopName(
              allBuses.find((b) => b.id === currentBusId) || allBuses[0],
              group.stopId,
            ) || group.stopId;
          let reason = "No compatible bus found";

          if (busesWithStop.length === 0) {
            // No bus covers this stop at all - this is a critical mismatch
            reason = `No bus serves stop "${normalizedGroupStopId}"`;
            console.log(
              `   ⚠️ CRITICAL: Stop ID "${normalizedGroupStopId}" not found in any bus route!`,
            );
            console.log(
              `   ⚠️ Available stop IDs in system:`,
              [
                ...new Set(
                  allBuses.flatMap((b) =>
                    [...(b.route?.stops || []), ...(b.stops || [])]
                      .map((s) => extractStopId(s))
                      .filter(Boolean),
                  ),
                ),
              ]
                .slice(0, 20)
                .join(", "),
            );
          } else {
            // Buses exist but shift doesn't match
            reason = `Buses cover this stop but none match shift "${group.shift}" (found: ${busesWithStop.map((b) => `${b.busNumber}:${b.shift}`).join(", ")})`;
          }

          unassignable.push({
            stopId: group.stopId,
            stopName: toTitleCase(stopName),
            shift: group.shift,
            count: group.count,
            reason,
          });
          console.log(`   ❌ UNASSIGNABLE: ${reason}`);
          continue; // Skip to next group
        }

        // Exclude current bus ONLY for assignment candidacy
        candidates = candidates.filter((bus) => bus.id !== currentBusId);

        // Check seat availability - with detailed logging
        const beforeSeatFilter = candidates.length;
        candidates = candidates.filter((bus) => {
          const freeSeats = computeFreeSeats(bus, group.shift);
          const hasEnoughSeats = freeSeats >= group.count;
          if (!hasEnoughSeats) {
            console.log(
              `   ✗ Bus ${bus.busNumber} rejected: not enough seats (free: ${freeSeats}, need: ${group.count})`,
            );
          }
          return hasEnoughSeats;
        });

        console.log(
          `   → ${candidates.length}/${beforeSeatFilter} buses have enough seats`,
        );

        // Check threshold constraint - with detailed logging
        console.log(`   📊 Threshold check (max ${threshold}%):`);
        const beforeThresholdFilter = candidates.length;
        candidates = candidates.filter((bus) => {
          const loadBefore = calculateLoadPercentage(bus, group.shift);
          const loadAfter = loadBefore + (group.count / bus.capacity) * 100;
          const withinThreshold = loadAfter <= threshold;
          console.log(
            `      ${withinThreshold ? "✓" : "✗"} ${bus.busNumber}: ${loadBefore.toFixed(1)}% → ${loadAfter.toFixed(1)}% (threshold: ${threshold}%)`,
          );
          return withinThreshold;
        });

        console.log(
          `   → ${candidates.length}/${beforeThresholdFilter} buses within threshold (${threshold}%)`,
        );

        // If threshold is too restrictive, log a warning
        if (candidates.length === 0 && beforeThresholdFilter > 0) {
          console.log(
            `   ⚠️ WARNING: All ${beforeThresholdFilter} buses failed threshold check! Consider increasing threshold from ${threshold}%`,
          );
        }

        // Score candidates
        const scored = scoreCandidateBuses(
          candidates,
          group.shift,
          group.count,
          currentBusId,
        );

        // Select best bus
        let selectedCandidate: CandidateBus | null = null;

        if (randomize && scored.length > 0) {
          selectedCandidate = randomizeTopCandidates(scored, topN);
          console.log(`   → Randomized selection from top ${topN}`);
        } else if (scored.length > 0) {
          selectedCandidate = scored[0];
          console.log(`   → Selected best candidate`);
        }

        if (selectedCandidate) {
          const { bus } = selectedCandidate;
          const { morningCount = 0, eveningCount = 0 } = bus.load || {};

          const beforeLoad = {
            morning: morningCount,
            evening: eveningCount,
          };

          const afterLoad = {
            morning:
              group.shift === "Morning"
                ? morningCount + group.count
                : morningCount,
            evening:
              group.shift === "Evening"
                ? eveningCount + group.count
                : eveningCount,
          };

          const stopName = getStopName(bus, group.stopId);

          plan.push({
            stopId: group.stopId,
            stopName,
            shift: group.shift,
            studentCount: group.count,
            students: group.students,
            assignedBus: bus.id,
            assignedBusNumber: bus.busNumber,
            assignedRoute: bus.routeId,
            beforeLoad,
            afterLoad,
            loadPercentageBefore: selectedCandidate.loadPercentageBefore,
            loadPercentageAfter: selectedCandidate.loadPercentageAfter,
          });

          affectedBuses.add(bus.id);

          console.log(
            `   ✅ Assigned to ${bus.busNumber} | ${selectedCandidate.reason}`,
          );
        } else {
          // No valid candidate after capacity/threshold/current-bus checks
          // Since we handled compatibility early, this is strictly a capacity/threshold issue
          const stopName =
            getStopName(
              allBuses.find((b) => b.id === currentBusId) || allBuses[0],
              group.stopId,
            ) || group.stopId;

          unassignable.push({
            stopId: group.stopId,
            stopName: toTitleCase(stopName),
            shift: group.shift,
            count: group.count,
            reason:
              candidates.length === 0
                ? "No alternative bus available within constraints"
                : "Threshold/Capacity limits reached",
          });

          console.log(`   ❌ UNASSIGNABLE: Threshold/Capacity limits`);
        }
      }

      // Calculate summary
      const totalStudents = selectedStudents.length;
      const assignedStudents = plan.reduce((sum, p) => sum + p.studentCount, 0);
      const unassignedStudents = unassignable.reduce(
        (sum, u) => sum + u.count,
        0,
      );

      const result: AutoSplitResult = {
        success: plan.length > 0,
        plan,
        unassignable,
        summary: {
          totalGroups: stopGroups.length,
          assignedGroups: plan.length,
          unassignedGroups: unassignable.length,
          totalStudents,
          assignedStudents,
          unassignedStudents,
          affectedBuses: Array.from(affectedBuses),
        },
      };

      console.log("\n✅ AUTO-SPLIT Planning Complete:", {
        assigned: `${plan.length}/${stopGroups.length} groups`,
        students: `${assignedStudents}/${totalStudents} students`,
        buses: affectedBuses.size,
      });

      return result;
    } catch (error: any) {
      console.error("❌ AUTO-SPLIT Planning Failed:", error);
      return {
        success: false,
        plan: [],
        unassignable: [],
        summary: {
          totalGroups: 0,
          assignedGroups: 0,
          unassignedGroups: 0,
          totalStudents: selectedStudents.length,
          assignedStudents: 0,
          unassignedStudents: selectedStudents.length,
          affectedBuses: [],
        },
        error: error.message,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * AUTO-SPLIT EXECUTION
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Execute the assignment plan using Firestore transactions
   */
  async executeAutoSplit(
    plan: StopGroupAssignment[],
    currentBusId: string,
    reason: string,
    actorId: string,
    actorName: string,
  ): Promise<AutoSplitExecutionResult> {
    console.log("🚀 AUTO-SPLIT Execution Started:", {
      groups: plan.length,
      reason,
      actor: actorName,
    });

    if (plan.length === 0) {
      return {
        success: false,
        updatedStudents: [],
        busUpdates: [],
        summary: {
          movedCount: 0,
          affectedBuses: 0,
          affectedStops: [],
        },
        error: "No assignment plan provided",
      };
    }

    try {
      // Execute in a single transaction for atomicity
      const result = await runTransaction(db, async (transaction) => {
        const updatedStudents: AutoSplitExecutionResult["updatedStudents"] = [];
        const busUpdates = new Map<string, any>();
        const affectedStops = new Set<string>();

        // Track bus load changes
        const busLoadChanges = new Map<
          string,
          { morningDelta: number; eveningDelta: number }
        >();

        // Initialize load changes for current bus and target buses
        busLoadChanges.set(currentBusId, { morningDelta: 0, eveningDelta: 0 });

        for (const assignment of plan) {
          if (!busLoadChanges.has(assignment.assignedBus)) {
            busLoadChanges.set(assignment.assignedBus, {
              morningDelta: 0,
              eveningDelta: 0,
            });
          }

          // Calculate deltas
          const currentBusChanges = busLoadChanges.get(currentBusId)!;
          const targetBusChanges = busLoadChanges.get(assignment.assignedBus)!;

          if (assignment.shift === "Morning") {
            currentBusChanges.morningDelta -= assignment.studentCount;
            targetBusChanges.morningDelta += assignment.studentCount;
          } else {
            currentBusChanges.eveningDelta -= assignment.studentCount;
            targetBusChanges.eveningDelta += assignment.studentCount;
          }

          // Update students
          for (const student of assignment.students) {
            const studentRef = doc(db, "students", student.id);

            transaction.update(studentRef, {
              busId: assignment.assignedBus,
              routeId: assignment.assignedRoute,
              stopId: assignment.stopId,
              updatedAt: serverTimestamp(),
            });

            updatedStudents.push({
              uid: student.id,
              oldBusId: currentBusId,
              newBusId: assignment.assignedBus,
              oldRouteId: student.routeId,
              newRouteId: assignment.assignedRoute,
              stopId: assignment.stopId,
              shift: assignment.shift,
            });
          }

          affectedStops.add(assignment.stopId);
        }

        // Update bus loads
        for (const [busId, changes] of busLoadChanges) {
          const busRef = doc(db, "buses", busId);
          const busSnap = await transaction.get(busRef);

          if (!busSnap.exists()) {
            throw new Error(`Bus ${busId} not found`);
          }

          const busData = busSnap.data();
          const currentLoad = busData.load || {
            morningCount: 0,
            eveningCount: 0,
          };

          const newMorningCount = Math.max(
            0,
            (currentLoad.morningCount || 0) + changes.morningDelta,
          );
          const newEveningCount = Math.max(
            0,
            (currentLoad.eveningCount || 0) + changes.eveningDelta,
          );

          // Validate capacity constraints
          if (changes.morningDelta > 0 && newMorningCount > busData.capacity) {
            throw new Error(
              `Bus ${busData.busNumber} would exceed morning capacity (${newMorningCount}/${busData.capacity})`,
            );
          }
          if (changes.eveningDelta > 0 && newEveningCount > busData.capacity) {
            throw new Error(
              `Bus ${busData.busNumber} would exceed evening capacity (${newEveningCount}/${busData.capacity})`,
            );
          }

          // Update bus load
          transaction.update(busRef, {
            "load.morningCount": newMorningCount,
            "load.eveningCount": newEveningCount,
            "load.totalCount": newMorningCount + newEveningCount,
            updatedAt: serverTimestamp(),
          });

          busUpdates.set(busId, {
            busId,
            busNumber: busData.busNumber,
            morningCountBefore: currentLoad.morningCount || 0,
            morningCountAfter: newMorningCount,
            eveningCountBefore: currentLoad.eveningCount || 0,
            eveningCountAfter: newEveningCount,
          });
        }

        return {
          updatedStudents,
          busUpdates: Array.from(busUpdates.values()),
          affectedStops: Array.from(affectedStops),
        };
      });

      // Send notifications (outside transaction)
      await this.sendNotifications(plan, reason, actorName);

      // Create audit log (outside transaction)
      await this.createAuditLog(plan, reason, actorId, actorName);

      console.log("✅ AUTO-SPLIT Execution Complete:", {
        students: result.updatedStudents.length,
        buses: result.busUpdates.length,
        stops: result.affectedStops.length,
      });

      return {
        success: true,
        updatedStudents: result.updatedStudents,
        busUpdates: result.busUpdates,
        summary: {
          movedCount: result.updatedStudents.length,
          affectedBuses: result.busUpdates.length,
          affectedStops: result.affectedStops,
        },
      };
    } catch (error: any) {
      console.error("❌ AUTO-SPLIT Execution Failed:", error);
      toast.error(`Auto-split failed: ${error.message}`);

      return {
        success: false,
        updatedStudents: [],
        busUpdates: [],
        summary: {
          movedCount: 0,
          affectedBuses: 0,
          affectedStops: [],
        },
        error: error.message,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * HELPER METHODS
   * ═══════════════════════════════════════════════════════════════════════
   */

  private async sendNotifications(
    plan: StopGroupAssignment[],
    reason: string,
    actorName: string,
  ): Promise<void> {
    try {
      const { writeBatch, collection } = require("firebase/firestore");
      const batch = writeBatch(db);

      for (const assignment of plan) {
        for (const student of assignment.students) {
          const notifRef = doc(collection(db, "notifications"));
          batch.set(notifRef, {
            title: "🚌 Bus Reassignment (Auto-Split)",
            content: `You have been reassigned to ${assignment.assignedBusNumber}. Reason: ${reason}`,
            sender: {
              userId: "system",
              userName: "System",
              userRole: "system",
            },
            target: {
              type: "specific_users",
              specificUserIds: [student.id],
            },
            recipientIds: [student.id],
            autoInjectedRecipientIds: [],
            readByUserIds: [],
            isEdited: false,
            isDeletedGlobally: false,
            createdAt: serverTimestamp(),
            metadata: {
              type: "auto_split_reassignment",
              fromBusId: student.busId,
              toBusId: assignment.assignedBus,
              stopId: assignment.stopId,
              shift: assignment.shift,
              reason,
            },
          });
        }
      }

      await batch.commit();
      const totalNotifications = plan.reduce(
        (sum, p) => sum + p.studentCount,
        0,
      );
      console.log(`📧 Sent ${totalNotifications} notifications`);
    } catch (error) {
      console.error("Failed to send notifications:", error);
    }
  }

  private async createAuditLog(
    plan: StopGroupAssignment[],
    reason: string,
    actorId: string,
    actorName: string,
  ): Promise<void> {
    try {
      const { addDoc, collection } = require("firebase/firestore");

      await addDoc(collection(db, "activity_logs"), {
        type: "auto_split_reassignment",
        actorId,
        actorName,
        timestamp: serverTimestamp(),
        details: {
          groupCount: plan.length,
          studentCount: plan.reduce((sum, p) => sum + p.studentCount, 0),
          reason,
          assignments: plan.map((p) => ({
            stopId: p.stopId,
            shift: p.shift,
            studentCount: p.studentCount,
            assignedBus: p.assignedBusNumber,
            loadBefore: p.loadPercentageBefore.toFixed(1) + "%",
            loadAfter: p.loadPercentageAfter.toFixed(1) + "%",
          })),
        },
      });

      console.log("📝 Audit log created");
    } catch (error) {
      console.error("Failed to create audit log:", error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const autoSplitService = new AutoSplitService();
