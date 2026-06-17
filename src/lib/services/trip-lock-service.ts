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
const HEARTBEAT_MIN_WRITE_INTERVAL_MS = 20 * 1000;
const heartbeatWriteCache = new Map<string, number>();

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function timestampToMillis(value: unknown): number | null {
    if (!value) return null;
    if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof value.toMillis === 'function') {
        return value.toMillis();
    }
    if (typeof value === 'object' && value !== null && '_seconds' in value && typeof value._seconds === 'number') {
        return value._seconds * 1000;
    }
    if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function isLockExpired(lock: ActiveTripLock | undefined, nowMs = Date.now()): boolean {
    if (!lock?.active) return true;
    const expiresAtMs = timestampToMillis(lock.expiresAt);
    return expiresAtMs === null || nowMs > expiresAtMs;
}

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

            // No lock, inactive lock, or expired lock
            if (!lock || !lock.active || isLockExpired(lock)) {
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

        } catch (error: unknown) {
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
            const busRef = adminDb.collection('buses').doc(busId) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);
            let acquiredNewLock = false;
            let lockedTripId = tripId;

            try {
                lockedTripId = await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
                    const busDoc = await transaction.get(busRef);

                    if (!busDoc.exists) {
                        throw new Error('Bus not found');
                    }

                    const busData = busDoc.data();
                    const lock = busData?.activeTripLock as ActiveTripLock | undefined;
                    const expired = isLockExpired(lock, now.getTime());

                    // Idempotent double-click/retry: return the existing active trip for this driver.
                    if (lock?.active && lock.driverId === driverId && lock.tripId && !expired) {
                        return lock.tripId;
                    }

                    // Check if already locked by another driver
                    if (lock?.active && lock.driverId !== driverId && !expired) {
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
                            expiresAt: Timestamp.fromDate(expiresAt),
                            startFcmSent: false,
                            endFcmSent: false
                        },
                        activeDriverId: driverId,
                        activeTripId: tripId
                    });

                    acquiredNewLock = true;
                    return tripId;
                });

            } catch (txError: unknown) {
                console.error('Firestore transaction error:', txError);

                const message = getErrorMessage(txError);
                if (message === 'LOCKED_BY_OTHER') {
                    return {
                        success: false,
                        reason: 'This bus is currently being operated by another driver. Please wait or try again later.',
                        errorCode: 'LOCKED_BY_OTHER'
                    };
                }

                return { success: false, reason: message, errorCode: 'FIRESTORE_ERROR' };
            }

            if (!acquiredNewLock) {
                return { success: true, tripId: lockedTripId };
            }

            // STEP 2: Create active_trips record
            const staleCutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_SECONDS * 1000).toISOString();
            await Promise.allSettled([
                this.supabase
                    .from('active_trips')
                    .update({ status: 'ended', end_time: now.toISOString() })
                    .eq('bus_id', busId)
                    .eq('status', 'active')
                    .lt('last_heartbeat', staleCutoff),
                this.supabase
                    .from('active_trips')
                    .update({ status: 'ended', end_time: now.toISOString() })
                    .eq('driver_id', driverId)
                    .eq('status', 'active')
                    .lt('last_heartbeat', staleCutoff)
            ]);

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

                const { data: existingTrip } = await this.supabase
                    .from('active_trips')
                    .select('trip_id, bus_id, driver_id, route_id')
                    .eq('status', 'active')
                    .or(`bus_id.eq.${busId},driver_id.eq.${driverId}`)
                    .limit(1)
                    .maybeSingle();

                if (existingTrip?.driver_id === driverId && existingTrip?.bus_id === busId) {
                    await this.updateFirestoreLockTripId(busId, existingTrip.trip_id);
                    return { success: true, tripId: existingTrip.trip_id };
                }

                // Rollback: release Firestore lock acquired by this request.
                await this.releaseLockIfMatches(busId, tripId);

                return { success: false, reason: 'Failed to create trip record', errorCode: 'SUPABASE_ERROR' };
            }

            return { success: true, tripId: tripId };

        } catch (error: unknown) {
            console.error('Start trip error:', error);
            return { success: false, reason: getErrorMessage(error) };
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
        const cacheKey = `${tripId}:${driverId}:${busId}`;
        const lastWrite = heartbeatWriteCache.get(cacheKey) || 0;

        if (now.getTime() - lastWrite < HEARTBEAT_MIN_WRITE_INTERVAL_MS) {
            return { success: true };
        }

        const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);

        try {
            // Update Supabase heartbeat
            const { data: heartbeatRows, error: updateError } = await this.supabase
                .from('active_trips')
                .update({ last_heartbeat: now.toISOString() })
                .eq('trip_id', tripId)
                .eq('driver_id', driverId)
                .eq('bus_id', busId)
                .eq('status', 'active')
                .select('trip_id');

            if (updateError) {
                console.error('Error updating heartbeat:', updateError);
                return { success: false, reason: 'Failed to update heartbeat' };
            }

            if (!heartbeatRows || heartbeatRows.length === 0) {
                return { success: false, reason: 'Active trip not found for this driver and bus' };
            }

            // Update Firestore lock expiration
            await adminDb.collection('buses').doc(busId).update({
                'activeTripLock.expiresAt': Timestamp.fromDate(expiresAt)
            });

            heartbeatWriteCache.set(cacheKey, now.getTime());
            if (heartbeatWriteCache.size > 5000) {
                const firstKey = heartbeatWriteCache.keys().next().value;
                if (firstKey) heartbeatWriteCache.delete(firstKey);
            }

            return { success: true };

        } catch (error: unknown) {
            console.error('Heartbeat error:', error);
            return { success: false, reason: getErrorMessage(error) };
        }
    }

    /**
     * End a trip cleanly (IDEMPOTENT + OWNERSHIP VERIFIED)
     * Updates active_trips to 'ended' status instead of deleting (audit trail).
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

            // Verify driver ownership before ending
            const { data: activeTrip } = await this.supabase
                .from('active_trips')
                .select('driver_id, status')
                .eq('trip_id', tripId)
                .eq('bus_id', busId)
                .maybeSingle();

            if (activeTrip) {
                // Ownership check: only the assigned driver can end
                if (activeTrip.driver_id !== driverId) {
                    return { success: false, reason: 'Only the assigned driver can end this trip' };
                }

                // IDEMPOTENT: If already ended, return success
                if (activeTrip.status === 'ended') {
                    await this.releaseLock(busId);
                    heartbeatWriteCache.delete(`${tripId}:${driverId}:${busId}`);
                    return { success: true };
                }

                // Update to 'ended' status instead of deleting (preserves audit trail)
                const { error: updateError } = await this.supabase
                    .from('active_trips')
                    .update({
                        status: 'ended',
                        end_time: now.toISOString(),
                    })
                    .eq('trip_id', tripId)
                    .eq('driver_id', driverId)
                    .eq('bus_id', busId)
                    .eq('status', 'active');

                if (updateError) {
                    console.error('Error ending trip in Supabase:', updateError);
                }
            } else {
                console.warn('No active trip record found for trip:', tripId);
            }

            // Release Firestore lock
            await this.releaseLock(busId);
            heartbeatWriteCache.delete(`${tripId}:${driverId}:${busId}`);

            return { success: true };

        } catch (error: unknown) {
            console.error('End trip error:', error);
            return { success: false, reason: getErrorMessage(error) };
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

    private async releaseLockIfMatches(busId: string, tripId: string): Promise<void> {
        if (!adminDb) return;

        await adminDb.runTransaction(async (transaction) => {
            const busRef = adminDb.collection('buses').doc(busId);
            const busDoc = await transaction.get(busRef);
            const lock = busDoc.data()?.activeTripLock;

            if (lock?.tripId === tripId) {
                transaction.update(busRef, {
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
            }
        });
    }

    private async updateFirestoreLockTripId(busId: string, tripId: string): Promise<void> {
        if (!adminDb) return;

        await adminDb.collection('buses').doc(busId).update({
            'activeTripLock.tripId': tripId,
            activeTripId: tripId
        });
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
