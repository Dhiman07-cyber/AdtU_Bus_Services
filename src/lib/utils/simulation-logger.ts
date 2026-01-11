/**
 * Simulation Actions Logger
 * 
 * This module provides utilities for logging simulation actions when
 * Simulation Mode is enabled but executeSimulationActions is false.
 * 
 * When in simulation mode, destructive actions (soft blocks, hard deletes)
 * are logged to a separate collection for admin review rather than being executed.
 * 
 * This provides a safe way to test the deadline enforcement system without
 * affecting production data.
 */

/**
 * Simulation action log entry (local definition)
 */
interface SimulationActionLog {
    id: string;
    action: 'soft_block' | 'hard_delete' | 'notification';
    studentId: string;
    studentEmail?: string;
    intendedDate: string;
    simulationYear: number;
    wouldHaveExecuted: {
        collections?: string[];
        cloudinaryImages?: boolean;
        firebaseAuth?: boolean;
        notifications?: boolean;
    };
    timestamp: Date;
    schedulerRunId: string;
}

/**
 * System action audit entry (local definition)
 */
interface SystemActionAudit {
    id: string;
    action: string;
    studentId?: string;
    studentEmail?: string;
    actorType: 'system' | 'scheduler' | 'admin' | 'moderator' | 'simulation';
    actorId?: string;
    actorName?: string;
    timestamp: Date;
    details: Record<string, any>;
    isSimulation: boolean;
    status: 'success' | 'failed' | 'pending';
    error?: string;
    schedulerRunId?: string;
}

/**
 * Simulation action to log (client-side type for API calls)
 */
export interface SimulationActionInput {
    action: 'soft_block' | 'hard_delete' | 'notification';
    studentId: string;
    studentEmail?: string;
    intendedDate: string;
    simulationYear: number;
    wouldHaveExecuted?: {
        collections?: string[];
        cloudinaryImages?: boolean;
        firebaseAuth?: boolean;
        notifications?: boolean;
    };
    schedulerRunId?: string;
}

/**
 * System action audit input (client-side type for API calls)
 */
export interface SystemActionInput {
    action: 'soft_block' | 'soft_block_removed' | 'urgent_warning_sent' | 'hard_delete' | 'config_change' | 'reactivation' | 'manual_override' | 'simulation_logged';
    studentId?: string;
    studentEmail?: string;
    actorType: 'system' | 'scheduler' | 'admin' | 'moderator' | 'simulation';
    actorId?: string;
    actorName?: string;
    details: Record<string, any>;
    isSimulation: boolean;
    schedulerRunId?: string;
}

import { SimulationConfig } from '@/lib/types/simulation-config';

/**
 * Check if we are in simulation mode
 * Uses the SimulationConfig
 */
export function isSimulationModeEnabled(config: SimulationConfig): boolean {
    return config?.enabled ?? false;
}

/**
 * Check if simulation actions should be executed (requires explicit opt-in)
 */
export function shouldExecuteSimulationActions(config: SimulationConfig): boolean {
    if (!config?.enabled) return true; // Not in simulation mode, execute normally
    return config?.executeSimulationActions ?? false; // Defaults to false
}

/**
 * Format a simulation action for display
 */
export function formatSimulationAction(action: SimulationActionLog): string {
    const actionNames = {
        soft_block: 'Soft Block',
        hard_delete: 'Hard Delete',
        notification: 'Notification'
    };

    return `[SIMULATION] ${actionNames[action.action]} - Student: ${action.studentId} (${action.studentEmail || 'no email'}) - Intended date: ${action.intendedDate}`;
}

/**
 * Format a system action for audit display
 */
export function formatSystemAction(action: SystemActionAudit): string {
    const actionNames: Record<string, string> = {
        soft_block: 'Soft Blocked',
        soft_block_removed: 'Soft Block Removed',
        urgent_warning_sent: 'Urgent Warning Sent',
        hard_delete: 'Hard Deleted',
        config_change: 'Config Changed',
        reactivation: 'Reactivated',
        manual_override: 'Manual Override',
        simulation_logged: 'Simulation Logged'
    };

    const actor = action.actorType === 'system' || action.actorType === 'scheduler'
        ? action.actorType.toUpperCase()
        : action.actorName || action.actorId || 'Unknown';

    return `${actionNames[action.action]} by ${actor}${action.studentId ? ` for student ${action.studentId}` : ''}${action.isSimulation ? ' [SIMULATION]' : ''}`;
}

/**
 * Generate a unique run ID for scheduler runs
 */
export function generateSchedulerRunId(): string {
    return `sched_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create a simulation action log entry
 */
export function createSimulationActionLog(
    input: SimulationActionInput
): Omit<SimulationActionLog, 'id' | 'timestamp'> {
    return {
        action: input.action,
        studentId: input.studentId,
        studentEmail: input.studentEmail,
        intendedDate: input.intendedDate,
        simulationYear: input.simulationYear,
        wouldHaveExecuted: input.wouldHaveExecuted || {
            collections: input.action === 'hard_delete' ? ['students', 'users', 'payments'] : [],
            cloudinaryImages: input.action === 'hard_delete',
            firebaseAuth: input.action === 'hard_delete',
            notifications: input.action !== 'hard_delete'
        },
        schedulerRunId: input.schedulerRunId || generateSchedulerRunId()
    };
}

/**
 * Create a system action audit entry
 */
export function createSystemActionAudit(
    input: SystemActionInput
): Omit<SystemActionAudit, 'id' | 'timestamp'> {
    return {
        action: input.action,
        studentId: input.studentId,
        studentEmail: input.studentEmail,
        actorType: input.actorType,
        actorId: input.actorId,
        actorName: input.actorName,
        details: input.details,
        isSimulation: input.isSimulation,
        status: 'success', // Default to success, can be overridden
        schedulerRunId: input.schedulerRunId
    };
}

/**
 * Format date for log display
 */
export function formatLogTimestamp(date: Date): string {
    return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

/**
 * Get simulation mode status message for UI display
 */
export function getSimulationModeMessage(
    enabled: boolean,
    executeActions: boolean,
    customYear: number
): string {
    if (!enabled) {
        return 'Simulation mode is OFF. All actions will be executed normally.';
    }

    if (executeActions) {
        return `⚠️ SIMULATION MODE (Year: ${customYear}) - Actions WILL be executed! This is for testing only.`;
    }

    return `🔬 SIMULATION MODE (Year: ${customYear}) - Actions are logged only, not executed. Safe for testing.`;
}

/**
 * Get action severity for UI styling
 */
export function getActionSeverity(action: string): 'info' | 'warning' | 'danger' {
    switch (action) {
        case 'hard_delete':
            return 'danger';
        case 'soft_block':
        case 'urgent_warning_sent':
            return 'warning';
        default:
            return 'info';
    }
}

/**
 * Get color class for action type
 */
export function getActionColorClass(action: string): string {
    switch (action) {
        case 'hard_delete':
            return 'text-red-500 bg-red-500/10';
        case 'soft_block':
        case 'urgent_warning_sent':
            return 'text-amber-500 bg-amber-500/10';
        case 'config_change':
            return 'text-blue-500 bg-blue-500/10';
        case 'reactivation':
        case 'soft_block_removed':
            return 'text-green-500 bg-green-500/10';
        default:
            return 'text-gray-500 bg-gray-500/10';
    }
}

/**
 * Get icon name for action type (for Lucide icons)
 */
export function getActionIcon(action: string): string {
    switch (action) {
        case 'hard_delete':
            return 'Trash2';
        case 'soft_block':
            return 'Lock';
        case 'soft_block_removed':
            return 'LockOpen';
        case 'urgent_warning_sent':
            return 'AlertTriangle';
        case 'config_change':
            return 'Settings';
        case 'reactivation':
            return 'CheckCircle';
        case 'notification':
            return 'Bell';
        default:
            return 'Info';
    }
}
