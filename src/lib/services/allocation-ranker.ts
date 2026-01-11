import type { BusData, StudentData } from '@/app/admin/smart-allocation/page';

interface ScoredBus extends BusData {
  score: number;
  seatScore: number;
  stopProximityScore: number;
  shiftMatchScore: number;
  loadReductionScore: number;
  availableSeats: number;
  newLoad: number;
}

export class AllocationRanker {
  private weights = {
    seatAvailability: 0.5,
    stopProximity: 0.3,
    shiftMatch: 0.15,
    loadReduction: 0.05
  };

  setWeights(weights: Partial<typeof this.weights>) {
    this.weights = { ...this.weights, ...weights };
  }

  rankBuses(
    candidateBuses: BusData[],
    students: StudentData[],
    sourceBus: BusData
  ): BusData[] {
    // Calculate scores for each bus
    const scoredBuses = candidateBuses.map(bus =>
      this.scoreBus(bus, students, sourceBus)
    );

    // Sort by score descending
    scoredBuses.sort((a, b) => b.score - a.score);

    return scoredBuses;
  }

  private scoreBus(
    bus: BusData,
    students: StudentData[],
    sourceBus: BusData
  ): ScoredBus {
    // Calculate available seats
    const availableSeats = bus.capacity - bus.currentMembers;

    // Calculate new load after reassignment
    const newMemberCount = bus.currentMembers + students.length;
    const newLoad = (newMemberCount / bus.capacity) * 100;

    // 1. Seat Availability Score (0-1)
    const seatScore = availableSeats >= students.length
      ? availableSeats / bus.capacity
      : 0;

    // 2. Stop Proximity Score (0-1)
    const stopProximityScore = this.calculateStopProximity(
      bus,
      students,
      sourceBus
    );

    // 3. Shift Match Score (0-1)
    const shiftMatchScore = this.calculateShiftMatch(
      bus,
      students,
      sourceBus
    );

    // 4. Load Reduction Impact Score (0-1)
    const loadReductionScore = this.calculateLoadReductionImpact(
      bus,
      students.length,
      sourceBus
    );

    // Calculate weighted total score
    const score =
      (this.weights.seatAvailability * seatScore) +
      (this.weights.stopProximity * stopProximityScore) +
      (this.weights.shiftMatch * shiftMatchScore) +
      (this.weights.loadReduction * loadReductionScore);

    return {
      ...bus,
      score,
      seatScore,
      stopProximityScore,
      shiftMatchScore,
      loadReductionScore,
      availableSeats,
      newLoad
    };
  }

  private calculateStopProximity(
    bus: BusData,
    students: StudentData[],
    sourceBus: BusData
  ): number {
    // Get unique stop IDs from students
    const studentStops = new Set(students.map(s => s.stopId));

    // Calculate average proximity score
    let totalScore = 0;
    let count = 0;

    for (const stopId of studentStops) {
      // Find stop index in source bus
      const sourceIndex = sourceBus.stops.findIndex(s => s.id === stopId);

      // Find stop index in candidate bus
      const candidateIndex = bus.stops.findIndex(s => s.id === stopId);

      if (sourceIndex !== -1 && candidateIndex !== -1) {
        // Calculate proximity based on sequence difference
        const sequenceDiff = Math.abs(candidateIndex - sourceIndex);
        const proximityScore = 1 / (1 + sequenceDiff);
        totalScore += proximityScore;
        count++;
      } else if (candidateIndex === -1) {
        // Stop not found in candidate bus
        return 0;
      }
    }

    return count > 0 ? totalScore / count : 0;
  }

  private calculateShiftMatch(
    bus: BusData,
    students: StudentData[],
    sourceBus: BusData
  ): number {
    // Check if shifts match
    if (bus.shift === sourceBus.shift) {
      return 1;
    }

    // Check if bus serves both shifts
    if (bus.shift === 'both' || sourceBus.shift === 'both') {
      return 0.75;
    }

    // Check student preferences if available
    const studentShifts = students.map(s => s.shift).filter(Boolean);
    if (studentShifts.length > 0) {
      const matchingShifts = studentShifts.filter(shift =>
        shift === bus.shift || bus.shift === 'both'
      );
      return matchingShifts.length / studentShifts.length;
    }

    // Different shifts
    return 0.25;
  }

  private calculateLoadReductionImpact(
    bus: BusData,
    studentCount: number,
    sourceBus: BusData
  ): number {
    // Calculate current overload of source bus
    const sourceOverload = Math.max(
      0,
      (sourceBus.currentMembers / sourceBus.capacity) - 0.9
    );

    // Calculate reduction in overload after moving students
    const newSourceMembers = sourceBus.currentMembers - studentCount;
    const newSourceLoad = newSourceMembers / sourceBus.capacity;
    const newSourceOverload = Math.max(0, newSourceLoad - 0.9);

    // Calculate increase in target bus load
    const targetCurrentLoad = bus.currentMembers / bus.capacity;
    const targetNewMembers = bus.currentMembers + studentCount;
    const targetNewLoad = targetNewMembers / bus.capacity;

    // Penalize if target bus would become overloaded
    if (targetNewLoad > 0.9) {
      return 0;
    }

    // Score based on how much overload is reduced
    const overloadReduction = sourceOverload - newSourceOverload;

    // Bonus for bringing source bus below threshold
    const bringsSourceBelowThreshold = newSourceLoad <= 0.9 && sourceOverload > 0;

    // Calculate score
    let score = overloadReduction * 10; // Scale up the small decimal
    if (bringsSourceBelowThreshold) {
      score += 0.5;
    }

    // Penalize based on how close target bus gets to threshold
    const targetLoadPenalty = Math.max(0, targetNewLoad - 0.7) * 2;
    score -= targetLoadPenalty;

    return Math.max(0, Math.min(1, score));
  }

  findOptimalSplitAssignment(
    candidateBuses: BusData[],
    students: StudentData[],
    sourceBus: BusData
  ): Map<string, StudentData[]> {
    const assignments = new Map<string, StudentData[]>();
    const remainingStudents = [...students];

    // Sort buses by score
    const rankedBuses = this.rankBuses(candidateBuses, students, sourceBus);

    // Greedy assignment
    for (const bus of rankedBuses) {
      if (remainingStudents.length === 0) break;

      const availableSeats = bus.capacity - bus.currentMembers;
      if (availableSeats <= 0) continue;

      // Check which students can be assigned to this bus
      const assignableStudents = remainingStudents.filter(student =>
        bus.stops.some(stop => stop.id === student.stopId)
      );

      if (assignableStudents.length > 0) {
        // Assign up to available capacity
        const toAssign = assignableStudents.slice(
          0,
          Math.min(availableSeats, assignableStudents.length)
        );

        assignments.set(bus.id, toAssign);

        // Remove assigned students from remaining
        toAssign.forEach(student => {
          const index = remainingStudents.findIndex(s => s.id === student.id);
          if (index !== -1) {
            remainingStudents.splice(index, 1);
          }
        });
      }
    }

    // Check if all students were assigned
    if (remainingStudents.length > 0) {
      console.warn(
        `⚠️ Could not assign ${remainingStudents.length} student(s)`,
        remainingStudents.map(s => s.fullName)
      );
    }

    return assignments;
  }

  calculateMetrics(
    plans: any[],
    buses: Map<string, BusData>
  ): {
    totalStudentsMoved: number;
    busesAffected: number;
    averageLoadAfter: number;
    overloadedBusesAfter: number;
  } {
    // Track changes
    const busChanges = new Map<string, number>();

    plans.forEach(plan => {
      // Decrease from source
      const fromChange = busChanges.get(plan.fromBusId) || 0;
      busChanges.set(plan.fromBusId, fromChange - 1);

      // Increase to target
      const toChange = busChanges.get(plan.toBusId) || 0;
      busChanges.set(plan.toBusId, toChange + 1);
    });

    // Calculate metrics
    let totalLoad = 0;
    let overloadedCount = 0;
    let busCount = 0;

    for (const [busId, bus] of buses) {
      const change = busChanges.get(busId) || 0;
      const newMembers = bus.currentMembers + change;
      const load = (newMembers / bus.capacity) * 100;

      totalLoad += load;
      busCount++;

      if (load >= 90) {
        overloadedCount++;
      }
    }

    return {
      totalStudentsMoved: plans.length,
      busesAffected: busChanges.size,
      averageLoadAfter: totalLoad / busCount,
      overloadedBusesAfter: overloadedCount
    };
  }
}
