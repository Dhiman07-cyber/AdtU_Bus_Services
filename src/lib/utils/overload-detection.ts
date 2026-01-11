/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OVERLOAD DETECTION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Helper functions to detect which shift is overloaded and filter data accordingly
 */

export type ShiftType = 'Morning' | 'Evening' | 'Both';
export type OverloadedShift = 'morning' | 'evening' | 'both' | null;

export interface BusWithLoad {
    capacity: number;
    load?: {
        morningCount?: number;
        eveningCount?: number;
    };
}

/**
 * Detect which shift is overloaded for a bus
 * 
 * Returns:
 * - 'morning' if morning shift is overloaded
 * - 'evening' if evening shift is overloaded  
 * - 'both' if both shifts are overloaded
 * - null if no shift is overloaded
 */
export function detectOverloadedShift(bus: BusWithLoad, threshold: number = 100): OverloadedShift {
    const load = bus.load || { morningCount: 0, eveningCount: 0 };
    const capacity = bus.capacity;

    const morningCount = load.morningCount ?? 0;
    const eveningCount = load.eveningCount ?? 0;

    const morningPercentage = (morningCount / capacity) * 100;
    const eveningPercentage = (eveningCount / capacity) * 100;

    const morningOverloaded = morningPercentage > threshold;
    const eveningOverloaded = eveningPercentage > threshold;

    if (morningOverloaded && eveningOverloaded) {
        return 'both';
    } else if (morningOverloaded) {
        return 'morning';
    } else if (eveningOverloaded) {
        return 'evening';
    }

    return null;
}

/**
 * Get human-readable shift name
 */
export function getShiftDisplayName(shift: OverloadedShift): string {
    if (!shift) return 'N/A';
    if (shift === 'both') return 'Both Shifts';
    return shift.charAt(0).toUpperCase() + shift.slice(1) + ' Shift';
}

/**
 * Filter students by overloaded shift
 * 
 * If morning is overloaded, return only morning students
 * If evening is overloaded, return only evening students
 * If both are overloaded, return all students
 * If no overload, return all students
 */
export function filterStudentsByOverloadedShift<T extends { shift?: string }>(
    students: T[],
    overloadedShift: OverloadedShift
): T[] {
    if (!overloadedShift || overloadedShift === 'both') {
        return students;
    }

    return students.filter(student => {
        const studentShift = student.shift || '';
        return studentShift.toLowerCase() === overloadedShift.toLowerCase();
    });
}

/**
 * Check if a specific shift matches the overloaded shift filter
 */
export function shouldShowShift(shift: string, overloadedShift: OverloadedShift): boolean {
    if (!overloadedShift || overloadedShift === 'both') {
        return true;
    }

    return shift.toLowerCase() === overloadedShift.toLowerCase();
}
