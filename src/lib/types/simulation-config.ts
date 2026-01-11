export interface SimulationConfig {
    enabled: boolean;
    customYear: number;
    customMonth: number; // 0-indexed
    customDay: number;
    executeSimulationActions: boolean;
    syncSessionWithSimulatedDate?: boolean; // If true, ignore student's real validUntil and use simulated year
    lastUpdated?: string;
    lastUpdatedBy?: string;
}
