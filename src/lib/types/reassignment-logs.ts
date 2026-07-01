/**
 * Shared Supabase database types for reassignment logs.
 * Used by both the CRUD route and the rollback route.
 */

export type ReassignmentLogRow = {
    id: string;
    operation_id: string;
    type: string;
    actor_id: string;
    actor_label: string;
    logged_at: string;
    status: string;
    summary: string | null;
    changes: unknown[];
    meta: Record<string, unknown> | null;
    rollback_of: string | null;
    created_at: string;
    updated_at: string | null;
};

export type ReassignmentLogInsert = {
    operation_id: string;
    type: string;
    actor_id: string;
    actor_label: string;
    status: string;
    summary?: string | null;
    changes?: unknown[];
    meta?: Record<string, unknown>;
    rollback_of?: string | null;
};

export type ReassignmentLogUpdate = Partial<ReassignmentLogInsert>;

export type ReassignmentLogsDatabase = {
    public: {
        Tables: {
            reassignment_logs: {
                Row: ReassignmentLogRow;
                Insert: ReassignmentLogInsert;
                Update: ReassignmentLogUpdate;
                Relationships: [];
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
};
