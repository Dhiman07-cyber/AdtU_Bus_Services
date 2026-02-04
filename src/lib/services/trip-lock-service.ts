/**
 * Trip Lock Service (Simplified)
 * 
 * Handles multi-driver lock management with automatic heartbeat recovery.
 * No audit logging, no admin intervention - fully automatic and driver-driven.
 * 
 * "The system enforces exclusive bus operation using a server-controlled
 * distributed lock and automatic heartbeat recovery, without manual
 * overrides or administrative intervention."
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Configuration from environment
const HEARTBEAT_TIMEOUT_SECONDS = 300;
const LOCK_TTL_SECONDS = 300;

// Types
export interface ActiveTripLock {
    active: boolean;
    tripId: string | null;
    driverId: string | null;
    shift: 'morning' | 'evening' | 'both' | null;
    since: FirebaseFirestore.Timestamp | null;
    expiresAt: FirebaseFirestore.Timestamp | null;
}

export interface CanOperateResult {
    allowed: boolean;
    reason?: string;
}

export interface StartTripResult {
    success: boolean;
    tripId?: string;
    reason?: string;
    errorCode?: 'LOCKED_BY_OTHER' | 'FIRESTORE_ERROR' | 'SUPABASE_ERROR' | 'VALIDATION_ERROR';
}

export interface EndTripResult {
    success: boolean;
    reason?: string;
}

export interface HeartbeatResult {
    success: boolean;
    reason?: string;
}

/**
 * Trip Lock Service Class
 */
export class TripLockService {
    private supabase: SupabaseClient;

    constructor() {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing Supabase configuration');
        }

        this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false }
        });
    }

    /**
     * Check if a driver can operate a specific bus
     */
    async canOperate(driverId: string, busId: string): Promise<CanOperateResult> {
        if (!adminDb) {
            throw new Error('Firebase Admin not initialized');
        }

        try {
            // Read current lock state from Firestore
            const busDoc = await adminDb.collection('buses').doc(busId).get();

            if (!busDoc.exists) {
                return { allowed: false, reason: 'Bus not found' };
            }

            const busData = busDoc.data();
            const lock = busData?.activeTripLock as ActiveTripLock | undefined;

            // No lock or inactive lock
            if (!lock || !lock.active) {
                return { allowed: true };
            }

            // Lock exists - check if it's the same driver (continuation)
            if (lock.driverId === driverId) {
                return { allowed: true };
            }

            // Locked by another driver
            return {
                allowed: false,
                reason: 'This bus is currently being operated by another driver. Please wait or try again later.'
            };

        } catch (error: any) {
            console.error('Error checking lock status:', error);
            throw error;
        }
    }

    /**
     * Start a trip with exclusive lock acquisition
     * 
     * Steps:
     * 1. Acquire Firestore lock (transaction)
     * 2. Create active_trips record (Supabase)
     * 3. On failure: clear Firestore lock
     */
    async startTrip(
        driverId: string,
        busId: string,
        routeId: string,
        shift: 'morning' | 'evening' | 'both',
        tripId: string
    ): Promise<StartTripResult> {
        if (!adminDb) {
            return { success: false, reason: 'Firebase Admin not initialized', errorCode: 'FIRESTORE_ERROR' };
        }

        try {
            // STEP 1: Acquire Firestore lock via transaction
            const busRef = adminDb.collection('buses').doc(busId);
            const now = new Date();
            const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);

            try {
                await adminDb.runTransaction(async (transaction: { get: (arg0: any) => any; update: (arg0: any, arg1: { activeTripLock: { active: boolean; tripId: string; driverId: string; shift: "morning" | "evening" | "both"; since: FieldValue; expiresAt: Timestamp; }; activeDriverId: string; activeTripId: string; }) => void; }) => {
                    const busDoc = await transaction.get(busRef);

                    if (!busDoc.exists) {
                        throw new Error('Bus not found');
                    }

                    const busData = busDoc.data();
                    const lock = busData?.activeTripLock as ActiveTripLock | undefined;

                    // Check if already locked by another driver
                    if (lock?.active && lock.driverId !== driverId) {
                        throw new Error('LOCKED_BY_OTHER');
                    }

                    // Acquire lock
                    transaction.update(busRef, {
                        activeTripLock: {
                            active: true,
                            tripId: tripId,
                            driverId: driverId,
                            shift: shift,
                            since: FieldValue.serverTimestamp(),
                            expiresAt: Timestamp.fromDate(expiresAt)
                        },
                        activeDriverId: driverId,
                        activeTripId: tripId
                    });
                });

            } catch (txError: any) {
                console.error('Firestore transaction error:', txError);

                if (txError.message === 'LOCKED_BY_OTHER') {
                    return {
                        success: false,
                        reason: 'This bus is currently being operated by another driver. Please wait or try again later.',
                        errorCode: 'LOCKED_BY_OTHER'
                    };
                }

                return { success: false, reason: txError.message, errorCode: 'FIRESTORE_ERROR' };
            }

            // STEP 2: Create active_trips record
            const { error: activeInsertError } = await this.supabase
                .from('active_trips')
                .insert({
                    trip_id: tripId,
                    bus_id: busId,
                    driver_id: driverId,
                    route_id: routeId,
                    shift: shift,
                    status: 'active',
                    start_time: now.toISOString(),
                    last_heartbeat: now.toISOString()
                });

            if (activeInsertError) {
                console.error('Error creating active_trips record:', activeInsertError);

                // Rollback: release Firestore lock
                await this.releaseLock(busId);

                return { success: false, reason: 'Failed to create trip record', errorCode: 'SUPABASE_ERROR' };
            }

            return { success: true, tripId: tripId };

        } catch (error: any) {
            console.error('Start trip error:', error);
            return { success: false, reason: error.message || 'Unknown error' };
        }
    }

    /**
     * Update heartbeat for an active trip
     */
    async heartbeat(
        tripId: string,
        driverId: string,
        busId: string
    ): Promise<HeartbeatResult> {
        if (!adminDb) {
            return { success: false, reason: 'Firebase Admin not initialized' };
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);

        try {
            // Update Supabase heartbeat
            const { error: updateError } = await this.supabase
                .from('active_trips')
                .update({ last_heartbeat: now.toISOString() })
                .eq('trip_id', tripId)
                .eq('driver_id', driverId)
                .eq('status', 'active');

            if (updateError) {
                console.error('Error updating heartbeat:', updateError);
                return { success: false, reason: 'Failed to update heartbeat' };
            }

            // Update Firestore lock expiration
            await adminDb.collection('buses').doc(busId).update({
                'activeTripLock.expiresAt': Timestamp.fromDate(expiresAt)
            });

            return { success: true };

        } catch (error: any) {
            console.error('Heartbeat error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * End a trip cleanly
     */
    async endTrip(
        tripId: string,
        driverId: string,
        busId: string
    ): Promise<EndTripResult> {
        if (!adminDb) {
            return { success: false, reason: 'Firebase Admin not initialized' };
        }

        try {
            const now = new Date();

            // Update active_trips status
            const { error: updateError } = await this.supabase
                .from('active_trips')
                .update({
                    status: 'ended',
                    end_time: now.toISOString()
                })
                .eq('trip_id', tripId)
                .eq('driver_id', driverId);

            if (updateError) {
                console.error('Error ending trip in Supabase:', updateError);
            }

            // Release Firestore lock
            await this.releaseLock(busId);

            return { success: true };

        } catch (error: any) {
            console.error('End trip error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Release a Firestore lock
     */
    private async releaseLock(busId: string): Promise<void> {
        if (!adminDb) return;

        try {
            await adminDb.collection('buses').doc(busId).update({
                activeTripLock: {
                    active: false,
                    tripId: null,
                    driverId: null,
                    shift: null,
                    since: null,
                    expiresAt: null
                },
                activeDriverId: null,
                activeTripId: null,
                lastEndedAt: FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error releasing lock:', error);
            throw error;
        }
    }

    /**
     * Get active trip for a bus
     */
    async getActiveTrip(busId: string) {
        const { data, error } = await this.supabase
            .from('active_trips')
            .select('*')
            .eq('bus_id', busId)
            .eq('status', 'active')
            .maybeSingle();

        if (error) {
            console.error('Error fetching active trip:', error);
            return null;
        }

        return data;
    }
}

// Export singleton instance
export const tripLockService = new TripLockService();
