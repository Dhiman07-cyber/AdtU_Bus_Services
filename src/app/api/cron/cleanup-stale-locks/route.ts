/**
 * Stale Lock Cleanup Worker
 * 
 * Cron job endpoint that cleans up stale locks automatically.
 * Should be called every minute via Vercel Cron.
 * 
 * Actions:
 * 1. Clean stale active trips (no heartbeat > HEARTBEAT_TIMEOUT)
 * 2. Reconcile Firestore locks with Supabase state
 * 
 * No manual overrides, no admin intervention - fully automatic.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { db as adminDb, FieldValue } from '@/lib/firebase-admin';

// Configuration
const HEARTBEAT_TIMEOUT_SECONDS = 300;

// Verify cron secret to prevent unauthorized execution
function verifyCronAuth(request: Request): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If no secret configured, allow in development
    if (!cronSecret && process.env.NODE_ENV !== 'production') {
        return true;
    }

    return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
    // Verify cron auth
    if (!verifyCronAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    const stats = {
        staleLocksCleaned: 0,
        firestoreLocksReleased: 0,
        errors: [] as string[]
    };

    try {
        // Initialize Supabase
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json(
                { error: 'Missing Supabase configuration' },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log('🔄 Running stale lock cleanup...');

        // STEP 1: Clean stale active trips using database function
        try {
            const { data: cleanedLocks, error: cleanError } = await supabase
                .rpc('cleanup_stale_locks', { p_heartbeat_timeout_seconds: HEARTBEAT_TIMEOUT_SECONDS });

            if (cleanError) {
                console.error('Error cleaning stale locks:', cleanError);
                stats.errors.push(`stale_locks: ${cleanError.message}`);
            } else if (cleanedLocks && cleanedLocks.length > 0) {
                stats.staleLocksCleaned = cleanedLocks.length;

                // For each cleaned lock, also release Firestore lock
                for (const lock of cleanedLocks) {
                    try {
                        await releaseFirestoreLock(lock.cleaned_bus_id);
                        stats.firestoreLocksReleased++;

                        // Broadcast lock release
                        const channel = supabase.channel(`trip-status-${lock.cleaned_bus_id}`);
                        await channel.send({
                            type: 'broadcast',
                            event: 'trip_ended',
                            payload: {
                                busId: lock.cleaned_bus_id,
                                tripId: lock.cleaned_trip_id,
                                reason: 'heartbeat_timeout',
                                timestamp: new Date().toISOString()
                            }
                        });

                        // Also cleanup driver_status
                        await supabase
                            .from('driver_status')
                            .delete()
                            .eq('bus_id', lock.cleaned_bus_id);

                    } catch (err: any) {
                        console.error(`Error releasing Firestore lock for ${lock.cleaned_bus_id}:`, err);
                        stats.errors.push(`firestore_${lock.cleaned_bus_id}: ${err.message}`);
                    }
                }

                console.log(`✅ Cleaned ${stats.staleLocksCleaned} stale locks`);
            }
        } catch (err: any) {
            console.error('Error in stale lock cleanup:', err);
            stats.errors.push(`stale_locks_general: ${err.message}`);
        }

        // STEP 2: Reconcile Firestore locks with Supabase
        // Find Firestore locks that have no corresponding active trip in Supabase
        try {
            if (adminDb) {
                const busesSnapshot = await adminDb.collection('buses')
                    .where('activeTripLock.active', '==', true)
                    .get();

                for (const busDoc of busesSnapshot.docs) {
                    const busData = busDoc.data();
                    const tripId = busData.activeTripLock?.tripId;

                    if (tripId) {
                        // Check if trip exists in Supabase
                        const { data: activeTrip, error } = await supabase
                            .from('active_trips')
                            .select('trip_id, status')
                            .eq('trip_id', tripId)
                            .maybeSingle();

                        if (!error && (!activeTrip || activeTrip.status !== 'active')) {
                            // Orphaned Firestore lock - release it
                            console.log(`⚠️ Found orphaned Firestore lock for bus ${busDoc.id}, releasing...`);
                            await releaseFirestoreLock(busDoc.id);
                            stats.firestoreLocksReleased++;

                            // Cleanup driver_status
                            await supabase
                                .from('driver_status')
                                .delete()
                                .eq('bus_id', busDoc.id);
                        }
                    }
                }
            }
        } catch (err: any) {
            console.error('Error in lock reconciliation:', err);
            stats.errors.push(`reconciliation: ${err.message}`);
        }

        const elapsed = Date.now() - startTime;

        if (stats.staleLocksCleaned > 0 || stats.firestoreLocksReleased > 0) {
            console.log(`✅ Cleanup completed in ${elapsed}ms:`, stats);
        }

        return NextResponse.json({
            success: true,
            stats,
            elapsedMs: elapsed,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('❌ Cleanup worker error:', error);
        return NextResponse.json(
            { error: error.message || 'Cleanup failed' },
            { status: 500 }
        );
    }
}

/**
 * Release a Firestore lock
 */
async function releaseFirestoreLock(busId: string): Promise<void> {
    if (!adminDb) return;

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
}

// Also support POST for manual trigger
export async function POST(request: Request) {
    return GET(request);
}
