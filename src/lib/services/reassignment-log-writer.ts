/**
 * Shared helper for writing reassignment logs to Supabase via API.
 * Used by client-side reassignment services that run in the browser.
 */

import { auth } from '@/lib/firebase';

interface ReassignmentLogPayload {
    operationId: string;
    type: string;
    actorId: string;
    actorLabel: string;
    status: string;
    summary: string;
    changes: any[];
    meta: Record<string, any>;
}

export async function writeToSupabaseViaAPI(payload: ReassignmentLogPayload): Promise<boolean> {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error('[writeToSupabaseViaAPI] No authenticated user');
            return false;
        }

        const token = await user.getIdToken();

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
            console.error('[writeToSupabaseViaAPI] API error:', result.error);
            return false;
        }

        return true;
    } catch (err: any) {
        console.error('[writeToSupabaseViaAPI] Exception:', err.message);
        return false;
    }
}
