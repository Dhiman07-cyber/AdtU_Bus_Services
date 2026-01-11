"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Bus,
  MapPin,
  AlertTriangle,
  ArrowRight,
  Loader2,
  ListRestart,
  AlertCircle,
  GripHorizontal,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "react-hot-toast";

// =============================================================================
// TYPES
// =============================================================================

export interface StudentData {
  id: string;
  fullName: string;
  enrollmentId?: string;
  stopId: string;
  stopName?: string;
  assignedBusId: string;
  shift?: string;
  semester?: string;
  phone?: string;
  photoURL?: string;
}

interface BusStop {
  stopId: string;
  name: string;
  sequence: number;
}

export interface BusData {
  id: string;
  busNumber: string;
  routeId?: string;
  routeName?: string;
  driverId?: string;
  driverName?: string;
  driverPhoto?: string;
  currentMembers: number;
  capacity: number;
  shift: "morning" | "evening" | "both" | string;
  stops: Array<{ id: string; name: string; sequence: number }>;
  load?: {
    morningCount?: number;
    eveningCount?: number;
  };
  route?: {
    routeId: string;
    routeName: string;
    stops: BusStop[];
  };
}

interface ReassignmentPanelProps {
  selectedStudents: StudentData[];
  allBuses: BusData[];
  currentBus: BusData;
  onClose: () => void;
  onSuccess: (result: ReassignmentResult) => void;
}

export interface ReassignmentAssignment {
  studentId: string;
  studentName: string;
  targetBusId: string;
  targetBusNumber: string;
  stopName: string;
  shift: "Morning" | "Evening";
}

export interface ReassignmentResult {
  success: boolean;
  movedCount: number;
  fromBusId: string;
  fromBusNumber: string;
  assignments: ReassignmentAssignment[];
}

// Internal types for the algorithm
interface ProcessedStudent {
  student: StudentData;
  normalizedShift: "Morning" | "Evening";
  eligibleBuses: BusData[];
  assignment?: BusData; // The bus assigned by the algorithm
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function normalizeShift(shift: string | undefined): "Morning" | "Evening" {
  const s = (shift || "morning").toLowerCase().trim();
  return s === "evening" ? "Evening" : "Morning";
}

function isShiftCompatible(
  studentShift: "Morning" | "Evening",
  busShift: string | undefined,
): boolean {
  const normalizedBusShift = (busShift || "morning").toLowerCase().trim();

  if (studentShift === "Morning") {
    return normalizedBusShift === "morning" || normalizedBusShift === "both";
  }
  if (studentShift === "Evening") {
    return normalizedBusShift === "both";
  }
  return false;
}

/**
 * Helper to normalize stop IDs for comparison
 * Handles variations like "adtu_campus" vs "adtu campus" vs "ADTU Campus"
 */
function normalizeStopIdForComparison(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/[_\-\s]+/g, "") // Remove underscores, hyphens, spaces
    .replace(/[^a-z0-9]/g, ""); // Keep only alphanumeric
}

function busCoversStop(bus: BusData, stopId: string): boolean {
  if (!stopId) return false;
  const normalizedStopId = normalizeStopIdForComparison(stopId);

  console.log(`🔍 busCoversStop: Checking if bus ${bus.busNumber} covers stop "${stopId}" (normalized: "${normalizedStopId}")`);

  // Check route.stops (primary source)
  const routeStops = bus.route?.stops || [];
  const foundInRoute = routeStops.some((stop) => {
    const busStopId = normalizeStopIdForComparison(stop.stopId || "");
    const busStopName = normalizeStopIdForComparison(stop.name || "");
    const matches = busStopId === normalizedStopId || busStopName === normalizedStopId;
    if (matches) {
      console.log(`   ✅ Match found in route.stops: stopId="${stop.stopId}", name="${stop.name}"`);
    }
    return matches;
  });
  if (foundInRoute) return true;

  // Fallback: check stops array
  const uiStops = bus.stops || [];
  const foundInUI = uiStops.some((stop) => {
    const busStopId = normalizeStopIdForComparison(stop.id || "");
    const busStopName = normalizeStopIdForComparison(stop.name || "");
    const matches = busStopId === normalizedStopId || busStopName === normalizedStopId;
    if (matches) {
      console.log(`   ✅ Match found in stops array: id="${stop.id}", name="${stop.name}"`);
    }
    return matches;
  });

  if (!foundInRoute && !foundInUI) {
    console.log(`   ❌ No match found for stop "${stopId}" in bus ${bus.busNumber}`);
    console.log(`      Route stops: ${routeStops.map(s => s.stopId || s.name).join(", ")}`);
  }

  return foundInUI;
}

function getShiftLoad(bus: BusData, shift: "Morning" | "Evening"): number {
  const load = bus.load || { morningCount: 0, eveningCount: 0 };
  return shift === "Morning" ? load.morningCount || 0 : load.eveningCount || 0;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ReassignmentPanel({
  selectedStudents,
  allBuses,
  currentBus,
  onClose,
  onSuccess,
}: ReassignmentPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // DnD State
  const [isDragging, setIsDragging] = useState(false);
  const [draggedStudentId, setDraggedStudentId] = useState<string | null>(null);
  const [draggingBusId, setDraggingBusId] = useState<string | null>(null);
  const [dragOverBusId, setDragOverBusId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, studentId: string, fromBusId: string) => {
    // Set data for HTML5 DnD (just in case)
    e.dataTransfer.setData("studentId", studentId);
    e.dataTransfer.setData("fromBusId", fromBusId);

    setIsDragging(true);
    setDraggedStudentId(studentId);
    setDraggingBusId(fromBusId);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedStudentId(null);
    setDraggingBusId(null);
    setDragOverBusId(null);
  };

  const handleStudentDrop = (studentId: string, targetBusId: string) => {
    if (targetBusId === draggingBusId) return;
    setAssignments(prev => ({
      ...prev,
      [studentId]: targetBusId
    }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ALGORITHM: Pre-Analysis & Load-Balanced Distribution
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // ALGORITHM: Pre-Analysis & Load-Balanced Distribution
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Pre-Analysis: Calculate Compatibility Map (Static for session)
  // This tells us for each student, WHICH buses are physically possible (Route/Shift)
  // We do NOT check capacity here, because capacity changes dynamically during edits.
  const { studentOptions, assignableStudents, unassignable } = useMemo(() => {
    const options = new Map<string, BusData[]>();
    const assignable: ProcessedStudent[] = [];
    const unassignableList: { student: StudentData; reason: string }[] = [];

    selectedStudents.forEach((student) => {
      const shift = normalizeShift(student.shift);
      const stopId = (student.stopId || "").toLowerCase().trim();

      // Find compatible buses (Strict Constraints Only: Stop & Shift)
      const eligible = allBuses.filter((bus) => {
        if (bus.id === currentBus.id) return false;
        if (!isShiftCompatible(shift, bus.shift)) return false;
        if (!busCoversStop(bus, stopId)) return false;
        return true;
      });

      if (eligible.length === 0) {
        let reason = "No alternative buses available";
        const coversStop = allBuses.some(b => b.id !== currentBus.id && busCoversStop(b, stopId));
        const compatibleShift = allBuses.some(b => b.id !== currentBus.id && isShiftCompatible(shift, b.shift));

        if (!coversStop) reason = `Only current bus serves this stop`;
        else if (!compatibleShift) reason = `No other buses support ${shift} shift`;

        unassignableList.push({ student, reason });
      } else {
        options.set(student.id, eligible);
        assignable.push({
          student,
          normalizedShift: shift,
          eligibleBuses: eligible,
        });
      }
    });

    return { studentOptions: options, assignableStudents: assignable, unassignable: unassignableList };
  }, [selectedStudents, allBuses, currentBus]);

  // 2. State: Draft Assignments
  // Map<StudentId, BusId>
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // 3. Initial Allocation (Run once on mount)
  useEffect(() => {
    const initialMap: Record<string, string> = {};

    // Simulation state for the greedy algorithm
    const busSimulationState = new Map<string, { morningLoad: number; eveningLoad: number; capacity: number }>();
    allBuses.forEach((bus) => {
      if (bus.id === currentBus.id) return;
      busSimulationState.set(bus.id, {
        morningLoad: bus.load?.morningCount || 0,
        eveningLoad: bus.load?.eveningCount || 0,
        capacity: bus.capacity || bus.currentMembers || 50,
      });
    });

    // Run Greedy Allocation
    assignableStudents.forEach((pStudent) => {
      const shift = pStudent.normalizedShift;

      // Sort eligible buses by current projected load (ASC)
      const sortedCandidates = [...pStudent.eligibleBuses].sort((a, b) => {
        const stateA = busSimulationState.get(a.id)!;
        const stateB = busSimulationState.get(b.id)!;

        const loadA = shift === "Morning" ? stateA.morningLoad : stateA.eveningLoad;
        const loadB = shift === "Morning" ? stateB.morningLoad : stateB.eveningLoad;

        return (loadA / stateA.capacity) - (loadB / stateB.capacity);
      });

      // Try to assign
      for (const candidate of sortedCandidates) {
        const state = busSimulationState.get(candidate.id)!;
        const currentLoad = shift === "Morning" ? state.morningLoad : state.eveningLoad;

        if (currentLoad < state.capacity) {
          initialMap[pStudent.student.id] = candidate.id;

          // Update simulation
          if (shift === "Morning") state.morningLoad++;
          else state.eveningLoad++;
          break;
        }
      }
      // If no assignment found (full), student stays in 'assignableStudents' but logic won't put them in map
      // They will just not appear in the draft plan? 
      // Actually, we should probably assign them to *something* or leave them unassigned.
      // If we leave them unassigned, they won't show in the plan.
      // Let's assume for now the greedy algo finds a spot or they are effectively 'unassignable' dynamically.
    });

    setAssignments(initialMap);
  }, [assignableStudents, allBuses, currentBus]);

  // 4. Derived State: Live Plan & Loads
  // Re-calculate this whenever 'assignments' changes
  const { plan, busLoadImpacts, liveBusLoads } = useMemo(() => {
    const planMap = new Map<string, { bus: BusData; students: StudentData[] }>();

    // Helper to get base loads
    const currentLoads = new Map<string, { morning: number; evening: number; capacity: number }>();
    allBuses.forEach(b => {
      currentLoads.set(b.id, {
        morning: b.load?.morningCount || 0,
        evening: b.load?.eveningCount || 0,
        capacity: b.capacity || b.currentMembers || 50
      });
    });

    // Build Plan & Add Impacts
    Object.entries(assignments).forEach(([studentId, busId]) => {
      const student = selectedStudents.find(s => s.id === studentId);
      const bus = allBuses.find(b => b.id === busId);

      if (student && bus) {
        if (!planMap.has(busId)) {
          planMap.set(busId, { bus, students: [] });
        }
        planMap.get(busId)!.students.push(student);

        // Update live load
        const load = currentLoads.get(busId)!;
        const shift = normalizeShift(student.shift);
        if (shift === "Morning") load.morning++;
        else load.evening++;
      }
    });

    // Calculate UI Impacts
    const impacts = new Map<string, { addedMorning: number; addedEvening: number }>();
    planMap.forEach((data, busId) => {
      let m = 0, e = 0;
      data.students.forEach(s => {
        if (normalizeShift(s.shift) === "Morning") m++; else e++;
      });
      impacts.set(busId, { addedMorning: m, addedEvening: e });
    });

    return {
      plan: Array.from(planMap.values()),
      busLoadImpacts: impacts,
      liveBusLoads: currentLoads
    };
  }, [assignments, selectedStudents, allBuses]);

  // Total students being moved
  const totalMoving = plan.reduce((sum, item) => sum + item.students.length, 0);

  // Get auth context for API call
  const { currentUser, userData } = useAuth();

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (totalMoving === 0 || isProcessing) return;

    setIsProcessing(true);

    try {
      // Get the current user's token for authentication
      if (!currentUser) {
        throw new Error("You must be logged in to perform reassignments");
      }

      const token = await currentUser.getIdToken();

      // Build assignments array for API
      const apiAssignments: Array<{
        studentId: string;
        studentName: string;
        fromBusId: string;
        toBusId: string;
        toBusNumber: string;
        shift: "Morning" | "Evening";
        stopName?: string;
      }> = [];

      for (const item of plan) {
        for (const student of item.students) {
          apiAssignments.push({
            studentId: student.id,
            studentName: student.fullName,
            fromBusId: currentBus.id,
            toBusId: item.bus.id,
            toBusNumber: item.bus.busNumber,
            shift: normalizeShift(student.shift),
            stopName: student.stopName || student.stopId,
          });
        }
      }

      // Call the server-side API endpoint
      const response = await fetch("/api/admin/reassign-students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          assignments: apiAssignments,
          sourceBusId: currentBus.id,
          actorId: currentUser.uid,
          actorName: userData?.fullName || userData?.name || currentUser.email || "Unknown",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to reassign students");
      }

      // Success!
      toast.success(
        `Successfully reassigned ${totalMoving} student${totalMoving > 1 ? "s" : ""}`,
      );

      // Build final assignments for callback
      const finalAssignments: ReassignmentAssignment[] = apiAssignments.map(a => ({
        studentId: a.studentId,
        studentName: a.studentName,
        targetBusId: a.toBusId,
        targetBusNumber: a.toBusNumber,
        stopName: a.stopName || "",
        shift: a.shift,
      }));

      onSuccess({
        success: true,
        movedCount: totalMoving,
        fromBusId: currentBus.id,
        fromBusNumber: currentBus.busNumber,
        assignments: finalAssignments,
      });
      onClose();

    } catch (error: any) {
      console.error("Reassignment failed:", error);

      // Provide more helpful error messages
      let errorMessage = error.message || "Unknown error";

      if (error.code === "permission-denied" || errorMessage.includes("permission") || errorMessage.includes("Insufficient")) {
        errorMessage = "Permission denied. Please verify you are logged in as an admin or moderator.";
        console.error("🔒 Permission Error Details:", {
          code: error.code,
          message: error.message,
        });
      }

      toast.error(`Reassignment failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [plan, currentBus, totalMoving, onSuccess, onClose, isProcessing, currentUser, userData]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-0 shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[90vh] mt-5">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 dark:from-purple-950/30 dark:via-pink-950/30 dark:to-purple-950/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Bus className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Reassignment Plan
              </DialogTitle>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                AI-Optimized Distribution for {selectedStudents.length} Students
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* 1. Unassignable Warning (if any) */}
          {unassignable.length > 0 && (
            <div className="px-5 py-3 border-b border-red-100 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">
                    {unassignable.length} student{unassignable.length !== 1 ? "s" : ""} cannot be reassigned
                  </h4>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 mb-2">
                    They will remain on <span className="font-bold">{currentBus.busNumber}</span>.
                  </p>

                  <div className="mt-2">
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                    >
                      {showDetails ? "Hide details" : "View details"}
                    </button>

                    {showDetails && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-2 space-y-3"
                      >
                        {Array.from(
                          unassignable.reduce((acc, item) => {
                            if (!acc.has(item.reason)) acc.set(item.reason, []);
                            acc.get(item.reason)!.push(item.student);
                            return acc;
                          }, new Map<string, StudentData[]>())
                        ).map(([reason, students], i) => (
                          <div key={i} className="bg-white dark:bg-red-950/20 p-2 rounded border border-red-100 dark:border-red-900/30">
                            <div className="flex items-start gap-2 mb-1.5">
                              <div className="w-1 h-1 bg-red-400 rounded-full mt-1.5 flex-shrink-0" />
                              <span className="text-xs font-semibold text-red-700 dark:text-red-400 italic">
                                Reason: {reason}
                              </span>
                            </div>
                            <div className="pl-3 flex flex-wrap gap-1.5">
                              {students.map(s => (
                                <Badge key={s.id} variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-[10px] border-red-100 dark:border-red-800/50 py-0 h-4 font-normal">
                                  {s.fullName}
                                  <span className="opacity-70 ml-1">({s.stopName})</span>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Proposed Plan */}
          {/* Scroll Container with ref for auto-scrolling */}
          <div
            className="flex-1 overflow-y-auto p-5 scroll-smooth relative"
            onDragOver={(e) => {
              // Basic auto-scroll logic
              const container = e.currentTarget;
              const threshold = 100; // px from top/bottom
              const speed = 10; // px per frame estimate

              const rect = container.getBoundingClientRect();
              const y = e.clientY - rect.top;

              if (y < threshold) {
                container.scrollTop -= speed;
              } else if (y > rect.height - threshold) {
                container.scrollTop += speed;
              }
            }}
          >
            {plan.length === 0 ? (
              // Only happens if ALL selected students are unassignable
              <div className="text-center py-10 opacity-70">
                <ListRestart className="w-12 h-12 mx-auto text-zinc-300 mb-3" />
                <p className="text-zinc-500 font-medium">No valid reassignment options found.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-2 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                    Proposed Assignment
                  </h3>
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    Moving {totalMoving} students
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {plan.map((item, idx) => {
                    const impact = busLoadImpacts.get(item.bus.id);
                    const liveLoad = liveBusLoads.get(item.bus.id)!;

                    // Calculate Metrics
                    const capacity = item.bus.capacity || 50;
                    // Current count (Pre-move)
                    const baseMorning = item.bus.load?.morningCount || 0;
                    const baseEvening = item.bus.load?.eveningCount || 0;
                    const baseTotal = baseMorning + baseEvening;

                    // Projected count (Post-move)
                    const projectedMorning = liveLoad.morning;
                    const projectedEvening = liveLoad.evening;
                    const projectedTotal = projectedMorning + projectedEvening;

                    const currentPercent = Math.min(100, (baseTotal / capacity) * 100);
                    const projectedPercent = Math.min(100, (projectedTotal / capacity) * 100);
                    const availableSeats = Math.max(0, capacity - projectedTotal);

                    const addedCount = item.students.length;

                    // DnD State Visuals
                    const isTarget = isDragging && dragOverBusId === item.bus.id;
                    const draggedStudent = isDragging && draggedStudentId ? selectedStudents.find(s => s.id === draggedStudentId) : null;

                    let dragStatus: 'none' | 'valid' | 'invalid' = 'none';
                    if (isDragging && draggedStudent) {
                      const opts = studentOptions.get(draggedStudent.id) || [];
                      const isValid = opts.some(b => b.id === item.bus.id);
                      const isFull = projectedTotal >= capacity && item.bus.id !== assignments[draggedStudent.id]; // Check if moving here would overflow

                      // If dragging over this card
                      if (dragOverBusId === item.bus.id) {
                        if (isValid && !isFull) dragStatus = 'valid';
                        else dragStatus = 'invalid';
                      }
                    }

                    return <motion.div
                      key={item.bus.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: isTarget ? 1.02 : 1,
                      }}
                      transition={{ delay: idx * 0.1 }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedStudentId && draggingBusId !== item.bus.id) {
                          setDragOverBusId(item.bus.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverBusId === item.bus.id) {
                          setDragOverBusId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverBusId(null);
                        if (draggedStudentId && dragStatus === 'valid') {
                          handleStudentDrop(draggedStudentId, item.bus.id);
                        } else if (dragStatus === 'invalid') {
                          toast.error("Cannot assign student to this bus");
                        }
                      }}
                      className={cn(
                        "group relative transition-all duration-300 rounded-xl p-4 shadow-lg border",
                        // Premium Card Styling (Dark, Vibrant, Contrast)
                        "bg-zinc-900 border-zinc-800/80",

                        // Hover Glow (unless dragging)
                        !isDragging && "hover:border-purple-500/50 hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]",

                        // Drag Feedback: VALID (Green)
                        dragStatus === 'valid' && "bg-emerald-950/30 border-emerald-500/80 shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] scale-[1.02]",

                        // Drag Feedback: INVALID (Red)
                        dragStatus === 'invalid' && "bg-red-950/30 border-red-500/80 shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] opacity-90",

                        // Not target but dragging
                        isDragging && !isTarget && "opacity-40 grayscale-[0.8] scale-[0.98]"
                      )}
                    >
                      {/* Card Header & Main Info */}
                      <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="flex items-start gap-3">
                          {/* Bus Icon Box */}
                          <div className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg transition-colors duration-300 border",
                            dragStatus === 'valid' ? "bg-emerald-900/50 border-emerald-500/50 text-emerald-400" :
                              dragStatus === 'invalid' ? "bg-red-900/50 border-red-500/50 text-red-400" :
                                "bg-zinc-800 border-zinc-700 text-purple-400 group-hover:bg-zinc-800 group-hover:border-purple-500/30 group-hover:text-purple-300"
                          )}>
                            {dragStatus === 'valid' ? <Check className="w-6 h-6" /> :
                              dragStatus === 'invalid' ? <X className="w-6 h-6" /> :
                                <Bus className="w-5 h-5" />
                            }
                          </div>

                          {/* Info */}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-lg text-white tracking-tight">{item.bus.busNumber}</h4>
                              {item.bus.route?.routeName && (
                                <Badge variant="outline" className="text-[10px] h-5 border-zinc-700 text-zinc-400 font-normal">
                                  {item.bus.route.routeName}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Shift Badge */}
                              <Badge className={cn(
                                "text-[10px] px-2 h-4 border",
                                normalizeShift(item.bus.shift) === "Morning"
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                  : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                              )}>
                                {normalizeShift(item.bus.shift)}
                              </Badge>

                              {item.bus.driverName && (
                                <div className="flex items-center gap-1.5 px-2 py-0 border rounded-full bg-zinc-800/80 border-zinc-700 text-zinc-400 hidden sm:flex">
                                  <User className="w-2.5 h-2.5" />
                                  <span className="text-[10px] font-medium max-w-[80px] truncate">
                                    {item.bus.driverName.split(' ')[0]}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Available Seats Badge */}
                        <div className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-300 shadow-sm",
                          dragStatus === 'valid' ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                            dragStatus === 'invalid' ? "bg-red-500 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]" :
                              availableSeats > 5
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          {dragStatus === 'valid' ? 'Drop to Assign' :
                            dragStatus === 'invalid' ? 'Full / Incompatible' :
                              `${availableSeats} seats left`}
                        </div>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 gap-4 mb-3 px-1">
                        {/* Current Load */}
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Current Load</div>
                          <div className="text-sm font-medium text-zinc-300">
                            {currentPercent.toFixed(0)}% <span className="text-zinc-500 text-xs">({baseTotal})</span>
                          </div>
                        </div>

                        {/* Projected Load */}
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-purple-400 font-bold mb-1">Projected</div>
                          <div className="text-sm font-bold text-white">
                            {projectedPercent.toFixed(0)}% <span className="text-zinc-500 text-xs font-normal">({projectedTotal})</span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden mb-4 border border-zinc-700/50">
                        {/* Combined bar showing total projected load */}
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${projectedPercent}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={cn(
                            "h-full rounded-full relative",
                            projectedPercent > 90
                              ? "bg-gradient-to-r from-red-600 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                              : "bg-gradient-to-r from-purple-600 to-indigo-500 shadow-[0_0_10px_rgba(147,51,234,0.4)]"
                          )}
                        >
                          {/* Marker for original load */}
                          {addedCount > 0 && (
                            <div
                              className="absolute right-0 top-0 bottom-0 bg-white/40 backdrop-blur-sm border-l border-white/30"
                              style={{ width: `${(addedCount / projectedTotal) * 100}%` }}
                            />
                          )}
                        </motion.div>
                      </div>

                      {/* Student List (New Arrivals) */}
                      <div className={cn(
                        "rounded-lg border p-3 transition-colors duration-300",
                        dragStatus === 'valid' ? "bg-emerald-900/20 border-emerald-500/20" :
                          dragStatus === 'invalid' ? "bg-red-900/20 border-red-500/20" :
                            "bg-zinc-950/50 border-zinc-800"
                      )}>
                        <div className="text-[10px] text-zinc-400 mb-2 font-medium flex items-center justify-between">
                          <span>Receiving {addedCount} students</span>
                          <div className="flex gap-2 text-[10px]">
                            {impact?.addedMorning ? <span className="text-amber-500/80">+{impact.addedMorning} Morning</span> : null}
                            {impact?.addedEvening ? <span className="text-indigo-400/80">+{impact.addedEvening} Evening</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 min-h-[30px]">
                          {item.students.map(s => {
                            const options = studentOptions.get(s.id) || [];
                            const shift = normalizeShift(s.shift);
                            const isBeingDragged = isDragging && draggedStudentId === s.id;

                            return (
                              <DropdownMenu key={s.id}>
                                <DropdownMenuTrigger asChild>
                                  <motion.div
                                    layoutId={`student-${s.id}`}
                                    draggable
                                    onDragStart={(e) => {
                                      handleDragStart(e as any, s.id, item.bus.id);
                                    }}
                                    onDragEnd={handleDragEnd}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn(
                                      "group/badge cursor-grab active:cursor-grabbing select-none relative",
                                      isBeingDragged ? "opacity-30" : "opacity-100"
                                    )}
                                  >
                                    <Badge variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-normal px-2.5 py-1 h-6 flex items-center gap-1.5 shadow-sm transition-all hover:border-purple-500/50 hover:text-white">
                                      <GripHorizontal className="w-3 h-3 text-zinc-600 group-hover/badge:text-zinc-400 mb-[1px]" />
                                      <span>{s.fullName}</span>
                                      <span className="text-zinc-600 border-l border-zinc-700 pl-1.5 ml-0.5 text-[9px] uppercase tracking-wider">{shift.substring(0, 3)}</span>
                                    </Badge>
                                  </motion.div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[260px] p-1.5 bg-zinc-950 border-zinc-800 text-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 z-50">
                                  <div className="px-2 py-2 text-xs font-semibold text-zinc-400 border-b border-zinc-800 mb-1 flex items-center justify-between bg-zinc-900/50 -mx-1.5 -mt-1.5">
                                    <span className="truncate max-w-[150px] text-zinc-300 pl-1.5">Reassign {s.fullName.split(' ')[0]}</span>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 flex-shrink-0 border-zinc-700 text-zinc-500 mr-1.5">{shift}</Badge>
                                  </div>
                                  <ScrollArea className="h-[200px] pr-2">
                                    {options.map(option => {
                                      const optionLoad = liveBusLoads.get(option.id)!;
                                      const currentShiftLoad = shift === "Morning" ? optionLoad.morning : optionLoad.evening;
                                      const isFull = currentShiftLoad >= optionLoad.capacity && option.id !== item.bus.id;
                                      const isCurrent = option.id === item.bus.id;

                                      return (
                                        <DropdownMenuItem
                                          key={option.id}
                                          disabled={isCurrent || isFull}
                                          onClick={() => {
                                            setAssignments(prev => ({
                                              ...prev,
                                              [s.id]: option.id
                                            }));
                                          }}
                                          className={cn(
                                            "flex flex-col items-start gap-1 p-2 my-1 cursor-pointer rounded-md border border-transparent transition-all",
                                            "focus:bg-zinc-900 focus:border-zinc-700 focus:text-white",
                                            isCurrent ? "bg-zinc-900/50 border-zinc-800 opacity-60" : "hover:bg-zinc-900 hover:border-zinc-800"
                                          )}
                                        >
                                          <div className="flex items-center justify-between w-full">
                                            <span className="font-bold text-sm text-zinc-200">{option.busNumber}</span>
                                            {isCurrent && <span className="text-[10px] text-zinc-600 font-medium">Current</span>}
                                            {isFull && !isCurrent && <span className="text-[10px] text-red-500 font-medium">Full</span>}
                                            {!isFull && !isCurrent && (
                                              <span className="text-[10px] text-emerald-500 font-medium whitespace-nowrap">
                                                {optionLoad.capacity - (shift === "Morning" ? optionLoad.morning : optionLoad.evening)} left
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-between w-full mt-0.5">
                                            <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">{option.route?.routeName || "No Route"}</span>
                                            <span className="text-[10px] text-zinc-600 font-medium">{normalizeShift(option.shift)}</span>
                                          </div>
                                        </DropdownMenuItem>
                                      );
                                    })}
                                    {options.length === 0 && (
                                      <div className="p-4 text-center text-xs text-zinc-600 italic">No compatible buses available</div>
                                    )}
                                  </ScrollArea>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex-shrink-0 flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            {totalMoving > 0 ? (
              <span>
                Moving <strong className="text-zinc-900 dark:text-zinc-200">{totalMoving}</strong> students to <strong className="text-zinc-900 dark:text-zinc-200">{plan.length}</strong> buses
              </span>
            ) : (
              <span>No action to be taken</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isProcessing} className="h-9">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={totalMoving === 0 || isProcessing}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white h-9 min-w-[120px]"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" /> Confirm All
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
