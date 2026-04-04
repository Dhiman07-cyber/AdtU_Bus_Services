/**
 * Driver Swap Service - Supabase-based Implementation
 * 
 * Provides real-time driver swap functionality using Supabase
 * for instant updates without polling.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { db as adminDb, FieldValue } from './firebase-admin';
import { calculateNotificationExpiry } from './notification-expiry';

// Default notification TTL: 1 day (24 hours)
const NOTIFICATION_TTL_DAYS = 1;

// Server-side Supabase client with service role
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SwapRequest {
    id: string;
    requester_driver_uid: string;
    requester_name: string;
    candidate_driver_uid: string;
    candidate_name: string;
    bus_id: string;
    bus_number: string | null;
    route_id: string | null;
    route_name: string | null;
    secondary_bus_id: string | null;
    secondary_bus_number: string | null;
    secondary_route_id: string | null;
    secondary_route_name: string | null;
    starts_at: string;
    ends_at: string;
    expires_at: string | null;
    swap_type: 'assignment' | 'swap';
    reason: string | null;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
    created_at: string;
    updated_at: string;
    accepted_by: string | null;
    accepted_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
    cancelled_by: string | null;
    cancelled_at: string | null;
    meta: Record<string, any>;
}

// Convert Supabase row to API response format (matching existing app expectations)
function toApiFormat(row: SwapRequest) {
    return {
        id: row.id,
        fromDriverUID: row.requester_driver_uid,
        fromDriverName: row.requester_name,
        toDriverUID: row.candidate_driver_uid,
        toDriverName: row.candidate_name,
        busId: row.bus_id,
        busNumber: row.bus_number || row.meta?.busNumber || '',
        routeId: row.route_id || row.meta?.routeId || '',
        routeName: row.route_name || row.meta?.routeName || '',
        secondaryBusId: row.secondary_bus_id,
        secondaryBusNumber: row.secondary_bus_number,
        secondaryRouteId: row.secondary_route_id,
        secondaryRouteName: row.secondary_route_name,
        timePeriod: {
            startTime: row.starts_at,
            endTime: row.ends_at,
            type: row.meta?.timePeriodType || 'custom'
        },
        expiresAt: row.expires_at,
        swapType: row.swap_type,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        acceptedBy: row.accepted_by,
        acceptedAt: row.accepted_at,
        rejectedBy: row.rejected_by,
        rejectedAt: row.rejected_at,
        cancelledBy: row.cancelled_by,
        cancelledAt: row.cancelled_at
    };
}

export class DriverSwapSupabaseService {

    /**
     * Create a new swap request
     */
    static async createSwapRequest(params: {
        fromDriverUID: string;
        fromDriverName: string;
        toDriverUID: string;
        toDriverName: string;
        busId: string;
        busNumber: string;
        routeId: string;
        routeName: string;
        secondaryBusId?: string;
        secondaryBusNumber?: string;
        secondaryRouteId?: string;
        secondaryRouteName?: string;
        startTime: string;
        endTime: string;
        timePeriodType?: string;
        swapType?: 'assignment' | 'swap';
        reason?: string;
    }): Promise<{ success: boolean; requestId?: string; error?: string }> {
        try {
            console.log('📝 Creating swap request in Supabase...');

            // Calculate expiry time (20 minutes from now)
            const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

            const { data, error } = await supabase
                .from('driver_swap_requests')
                .insert({
                    requester_driver_uid: params.fromDriverUID,
                    requester_name: params.fromDriverName,
                    candidate_driver_uid: params.toDriverUID,
                    candidate_name: params.toDriverName,
                    bus_id: params.busId,
                    bus_number: params.busNumber,
                    route_id: params.routeId,
                    route_name: params.routeName,
                    secondary_bus_id: params.secondaryBusId || null,
                    secondary_bus_number: params.secondaryBusNumber || null,
                    secondary_route_id: params.secondaryRouteId || null,
                    secondary_route_name: params.secondaryRouteName || null,
                    starts_at: params.startTime,
                    ends_at: params.endTime,
                    expires_at: expiresAt,
                    swap_type: params.swapType || 'assignment',
                    reason: params.reason || null,
                    status: 'pending',
                    meta: {
                        timePeriodType: params.timePeriodType || 'custom',
                        busNumber: params.busNumber,
                        routeName: params.routeName
                    }
                })
                .select()
                .single();

            if (error) {
                console.error('❌ Error creating swap request:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Swap request created:', data.id);

            // Send notification to target driver
            await this.sendSwapRequestNotification(
                data.id,
                params.fromDriverName,
                params.toDriverName,
                params.busNumber,
                params.toDriverUID
            );

            return { success: true, requestId: data.id };
        } catch (error: any) {
            console.error('❌ Exception creating swap request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get swap requests for a driver
     */
    static async getSwapRequests(params: {
        driverUid: string;
        type: 'incoming' | 'outgoing' | 'all';
        status?: string;
    }): Promise<{ requests: any[]; error?: string }> {
        try {
            let query = supabase.from('driver_swap_requests').select('*');

            if (params.type === 'incoming') {
                query = query.eq('candidate_driver_uid', params.driverUid);
            } else if (params.type === 'outgoing') {
                query = query.eq('requester_driver_uid', params.driverUid);
            } else {
                query = query.or(`requester_driver_uid.eq.${params.driverUid},candidate_driver_uid.eq.${params.driverUid}`);
            }

            if (params.status) {
                query = query.eq('status', params.status);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error fetching swap requests:', error);
                return { requests: [], error: error.message };
            }

            // Convert to API format
            const requests = (data || []).map(toApiFormat);
            return { requests };
        } catch (error: any) {
            console.error('❌ Exception fetching swap requests:', error);
            return { requests: [], error: error.message };
        }
    }

    /**
     * Accept a swap request
     */
    static async acceptSwapRequest(
        requestId: string,
        acceptorUid: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`✅ Accepting swap request: ${requestId}`);

            // Get the current request
            const { data: request, error: fetchError } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (fetchError || !request) {
                return { success: false, error: 'Swap request not found' };
            }

            if (request.status !== 'pending') {
                return { success: false, error: `Cannot accept: request is ${request.status}` };
            }

            if (request.candidate_driver_uid !== acceptorUid) {
                return { success: false, error: 'You are not the target of this swap request' };
            }

            // Update the request
            const { error: updateError } = await supabase
                .from('driver_swap_requests')
                .update({
                    status: 'accepted',
                    accepted_by: acceptorUid,
                    accepted_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (updateError) {
                return { success: false, error: updateError.message };
            }

            // Create temporary assignment
            await this.createTemporaryAssignment(request);

            // Update active trip session if requested
            if (request.meta?.applyToActiveTrip) {
                await this.updateActiveTripSession(request, acceptorUid);
            }

            // Send notifications
            await this.sendSwapAcceptedNotifications(request);
            await this.notifyStudentsOfDriverChange(request);

            console.log('✅ Swap request accepted successfully');
            return { success: true };
        } catch (error: any) {
            console.error('❌ Error accepting swap request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reject a swap request
     */
    static async rejectSwapRequest(
        requestId: string,
        rejectorUid: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`❌ Rejecting swap request: ${requestId}`);

            // Get the current request
            const { data: request, error: fetchError } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (fetchError || !request) {
                return { success: false, error: 'Swap request not found' };
            }

            if (request.status !== 'pending') {
                return { success: false, error: `Cannot reject: request is ${request.status}` };
            }

            if (request.candidate_driver_uid !== rejectorUid) {
                return { success: false, error: 'You are not the target of this swap request' };
            }

            // Update the request
            const { error: updateError } = await supabase
                .from('driver_swap_requests')
                .update({
                    status: 'rejected',
                    rejected_by: rejectorUid,
                    rejected_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (updateError) {
                return { success: false, error: updateError.message };
            }

            // Send notification to requester
            await this.sendSwapRejectedNotification(request);
            
            // Send real-time broadcast to both drivers
            await this.broadcastSwapUpdate(requestId, 'swap_rejected', {
              requestId,
              rejectedBy: rejectorUid,
              requesterName: request.requester_name,
              candidateName: request.candidate_name
            }, request);

            console.log('✅ Swap request rejected successfully');
            return { success: true };
        } catch (error: any) {
            console.error('❌ Error rejecting swap request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cancel a swap request (by requester)
     */
    static async cancelSwapRequest(
        requestId: string,
        cancellerUid: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`🚫 Cancelling swap request: ${requestId}`);

            // Get the current request
            const { data: request, error: fetchError } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (fetchError || !request) {
                return { success: false, error: 'Swap request not found' };
            }

            if (request.requester_driver_uid !== cancellerUid) {
                return { success: false, error: 'Only the requester can cancel this swap' };
            }

            if (request.status !== 'pending') {
                return { success: false, error: `Cannot cancel: request is ${request.status}` };
            }

            // Update the request
            const { error: updateError } = await supabase
                .from('driver_swap_requests')
                .update({
                    status: 'cancelled',
                    cancelled_by: cancellerUid,
                    cancelled_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (updateError) {
                return { success: false, error: updateError.message };
            }

            // Send real-time broadcast to both drivers
            await this.broadcastSwapUpdate(requestId, 'swap_cancelled', {
              requestId,
              cancelledBy: cancellerUid,
              requesterName: request.requester_name,
              candidateName: request.candidate_name
            }, request);

            console.log('✅ Swap request cancelled successfully');
            return { success: true };
        } catch (error: any) {
            console.error('❌ Error cancelling swap request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * End an active swap (revert assignment)
     * 
     * IMPORTANT: Checks for active trips before reverting
     * - If trip is ongoing, marks the swap as 'pending_revert' 
     * - System will auto-complete reversion when trip ends
     */
    static async endSwap(
        requestId: string,
        enderUid: string
    ): Promise<{ success: boolean; error?: string; pendingTripEnd?: boolean }> {
        try {
            console.log(`🔄 Ending swap: ${requestId} by ${enderUid}`);

            // Get the current request
            const { data: request, error: fetchError } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (fetchError || !request) {
                return { success: false, error: 'Swap request not found' };
            }

            if (request.status !== 'accepted' && request.status !== 'pending_revert') {
                return { success: false, error: 'Only accepted swaps can be ended' };
            }

            // Allow system to call this (for cron jobs)
            if (enderUid !== 'system') {
                // Verify the user is involved in the swap
                if (request.requester_driver_uid !== enderUid && request.candidate_driver_uid !== enderUid) {
                    return { success: false, error: 'You are not part of this swap' };
                }
            }

            // Check if there's an active trip on the primary bus
            // We check BOTH Supabase bus_locations AND Firestore activeTripId for robustness
            let hasPrimaryTrip = false;
            let hasSecondaryTrip = false;

            // Helper function to check if bus has active trip
            const checkBusActiveTrip = async (busId: string): Promise<boolean> => {
                // Method 1: Check Supabase bus_locations
                const { data: busTrip } = await supabase
                    .from('bus_locations')
                    .select('bus_id, driver_uid')
                    .eq('bus_id', busId)
                    .eq('is_active', true)
                    .limit(1);

                if (busTrip && busTrip.length > 0) {
                    console.log(`   📍 Active trip found in bus_locations for bus ${busId}`);
                    return true;
                }

                // Method 2: Check Firestore activeTripId
                const busDoc = await adminDb.collection('buses').doc(busId).get();
                const busData = busDoc.data();
                const tripId = busData?.activeTripId;

                if (tripId) {
                    // Verify the trip is actually still active (not ended)
                    const tripDoc = await adminDb.collection('trip_sessions').doc(tripId).get();
                    const tripData = tripDoc.data();

                    if (tripDoc.exists && tripData && !tripData.endedAt) {
                        console.log(`   📍 Active trip ${tripId} found in Firestore for bus ${busId}`);
                        return true;
                    }
                }

                return false;
            };

            // Check primary bus (candidate is currently driving this bus after swap)
            hasPrimaryTrip = await checkBusActiveTrip(request.bus_id);

            // Check secondary bus for true swaps (requester is currently driving this bus after swap)
            if (request.secondary_bus_id) {
                hasSecondaryTrip = await checkBusActiveTrip(request.secondary_bus_id);
            }

            const isAssignment = request.swap_type === 'assignment' || !request.secondary_bus_id;

            // ========== HANDLE CASE 1: ASSIGNMENT (Assigned → Reserved) ==========
            if (isAssignment) {
                if (hasPrimaryTrip) {
                    // Trip still active on primary bus - mark as pending_revert
                    console.log(`⏳ Trip in progress on primary bus - marking swap ${requestId} as pending_revert`);
                    console.log(`   → Bus ownership will remain with ${request.candidate_name} until trip completes`);

                    await supabase
                        .from('driver_swap_requests')
                        .update({
                            status: 'pending_revert',
                            meta: {
                                ...request.meta,
                                pending_revert_since: new Date().toISOString(),
                                revert_requested_by: enderUid,
                                primary_trip_active: true
                            }
                        })
                        .eq('id', requestId);

                    return {
                        success: true,
                        pendingTripEnd: true,
                        error: 'Swap will end automatically when current trip completes'
                    };
                }

                // No active trip - safe to revert for Assignment case
                console.log(`✅ No active trips - reverting ASSIGNMENT swap ${requestId}`);
                console.log('   📋 Reverting ASSIGNMENT...');

                // Restore bus to original driver (requester) AND clear activeTripId
                const busRef = adminDb.collection('buses').doc(request.bus_id);
                await busRef.update({
                    activeDriverId: request.requester_driver_uid,
                    assignedDriverId: request.requester_driver_uid,
                    activeTripId: null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ Bus ${request.bus_id} restored to ${request.requester_name}`);

                // Restore requester (fromDriver) - reassign to their original bus
                const fromDriverRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                await fromDriverRef.update({
                    assignedBusId: request.bus_id,
                    busId: request.bus_id,
                    assignedRouteId: request.route_id || null,
                    routeId: request.route_id || null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ From driver (${request.requester_name}) reassigned to bus`);

                // Make candidate (toDriver) reserved again
                const toDriverRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                await toDriverRef.update({
                    assignedBusId: null,
                    busId: null,
                    assignedRouteId: null,
                    routeId: null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ To driver (${request.candidate_name}) set to reserved`);

            } else {
                // ========== HANDLE CASE 2: TRUE SWAP (Assigned ↔ Assigned) ==========
                // After swap: candidate drives primary bus, requester drives secondary bus

                // Check previous partial revert state
                const previousPartialRevert = request.meta?.partial_revert_completed;

                if (hasPrimaryTrip && hasSecondaryTrip) {
                    // BOTH trips are active - wait for both to complete
                    console.log(`⏳ Both trips in progress - marking swap ${requestId} as pending_revert`);
                    console.log(`   → Primary bus (${request.bus_number}): ${request.candidate_name} still on trip`);
                    console.log(`   → Secondary bus (${request.secondary_bus_number}): ${request.requester_name} still on trip`);
                    console.log(`   → Both drivers keep their current buses until trips complete`);

                    await supabase
                        .from('driver_swap_requests')
                        .update({
                            status: 'pending_revert',
                            meta: {
                                ...request.meta,
                                pending_revert_since: new Date().toISOString(),
                                revert_requested_by: enderUid,
                                primary_trip_active: true,
                                secondary_trip_active: true,
                                partial_revert_completed: null
                            }
                        })
                        .eq('id', requestId);

                    return {
                        success: true,
                        pendingTripEnd: true,
                        error: 'Swap will end automatically when both trips complete'
                    };

                } else if (hasPrimaryTrip && !hasSecondaryTrip) {
                    // PRIMARY bus has active trip (candidate still driving)
                    // Secondary bus trip is done - make REQUESTER reserved temporarily
                    console.log(`⏳ Partial revert - Primary bus trip still active`);
                    console.log(`   → ${request.candidate_name} still on trip with ${request.bus_number} - keeps the bus`);
                    console.log(`   → ${request.requester_name} has finished trip - becomes RESERVED temporarily`);

                    // Make requester reserved (they finished their trip on secondary bus)
                    const requesterRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                    await requesterRef.update({
                        assignedBusId: null,
                        busId: null,
                        assignedRouteId: null,
                        routeId: null,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    console.log(`   ✅ ${request.requester_name} set to reserved (waiting for ${request.candidate_name}'s trip to end)`);

                    // Clear the secondary bus assignment (no driver now)
                    const secondaryBusRef = adminDb.collection('buses').doc(request.secondary_bus_id!);
                    await secondaryBusRef.update({
                        activeDriverId: null,
                        assignedDriverId: null,
                        activeTripId: null,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    console.log(`   ✅ Secondary bus (${request.secondary_bus_number}) temporarily unassigned`);

                    await supabase
                        .from('driver_swap_requests')
                        .update({
                            status: 'pending_revert',
                            meta: {
                                ...request.meta,
                                pending_revert_since: new Date().toISOString(),
                                revert_requested_by: enderUid,
                                primary_trip_active: true,
                                secondary_trip_active: false,
                                partial_revert_completed: 'secondary', // Secondary side reverted
                                requester_made_reserved: true
                            }
                        })
                        .eq('id', requestId);

                    return {
                        success: true,
                        pendingTripEnd: true,
                        error: `${request.requester_name} is now reserved. Swap will complete when ${request.candidate_name}'s trip ends.`
                    };

                } else if (!hasPrimaryTrip && hasSecondaryTrip) {
                    // SECONDARY bus has active trip (requester still driving)
                    // Primary bus trip is done - make CANDIDATE reserved temporarily
                    console.log(`⏳ Partial revert - Secondary bus trip still active`);
                    console.log(`   → ${request.requester_name} still on trip with ${request.secondary_bus_number} - keeps the bus`);
                    console.log(`   → ${request.candidate_name} has finished trip - becomes RESERVED temporarily`);

                    // Make candidate reserved (they finished their trip on primary bus)
                    const candidateRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                    await candidateRef.update({
                        assignedBusId: null,
                        busId: null,
                        assignedRouteId: null,
                        routeId: null,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    console.log(`   ✅ ${request.candidate_name} set to reserved (waiting for ${request.requester_name}'s trip to end)`);

                    // Clear the primary bus assignment (no driver now)
                    const primaryBusRef = adminDb.collection('buses').doc(request.bus_id);
                    await primaryBusRef.update({
                        activeDriverId: null,
                        assignedDriverId: null,
                        activeTripId: null,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    console.log(`   ✅ Primary bus (${request.bus_number}) temporarily unassigned`);

                    await supabase
                        .from('driver_swap_requests')
                        .update({
                            status: 'pending_revert',
                            meta: {
                                ...request.meta,
                                pending_revert_since: new Date().toISOString(),
                                revert_requested_by: enderUid,
                                primary_trip_active: false,
                                secondary_trip_active: true,
                                partial_revert_completed: 'primary', // Primary side reverted
                                candidate_made_reserved: true
                            }
                        })
                        .eq('id', requestId);

                    return {
                        success: true,
                        pendingTripEnd: true,
                        error: `${request.candidate_name} is now reserved. Swap will complete when ${request.requester_name}'s trip ends.`
                    };

                } else {
                    // NO trips active - complete full revert
                    console.log(`✅ No active trips - completing TRUE SWAP revert ${requestId}`);

                    // Check if this was a partial revert scenario
                    if (previousPartialRevert === 'secondary') {
                        // Secondary was already reverted - just need to complete primary side
                        console.log('   📋 Completing partial revert (secondary side was already done)...');

                        // Restore PRIMARY bus to requester
                        const primaryBusRef = adminDb.collection('buses').doc(request.bus_id);
                        await primaryBusRef.update({
                            activeDriverId: request.requester_driver_uid,
                            assignedDriverId: request.requester_driver_uid,
                            activeTripId: null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ Primary bus (${request.bus_number}) restored to ${request.requester_name}`);

                        // Restore SECONDARY bus to candidate
                        const secondaryBusRef = adminDb.collection('buses').doc(request.secondary_bus_id!);
                        await secondaryBusRef.update({
                            activeDriverId: request.candidate_driver_uid,
                            assignedDriverId: request.candidate_driver_uid,
                            activeTripId: null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ Secondary bus (${request.secondary_bus_number}) restored to ${request.candidate_name}`);

                        // Restore requester to primary bus
                        const fromDriverRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                        await fromDriverRef.update({
                            assignedBusId: request.bus_id,
                            busId: request.bus_id,
                            assignedRouteId: request.route_id || null,
                            routeId: request.route_id || null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ ${request.requester_name} restored to ${request.bus_number}`);

                        // Restore candidate to secondary bus
                        const toDriverRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                        await toDriverRef.update({
                            assignedBusId: request.secondary_bus_id,
                            busId: request.secondary_bus_id,
                            assignedRouteId: request.secondary_route_id || null,
                            routeId: request.secondary_route_id || null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ ${request.candidate_name} restored to ${request.secondary_bus_number}`);

                    } else if (previousPartialRevert === 'primary') {
                        // Primary was already reverted - just need to complete secondary side
                        console.log('   📋 Completing partial revert (primary side was already done)...');

                        // Restore PRIMARY bus to requester
                        const primaryBusRef = adminDb.collection('buses').doc(request.bus_id);
                        await primaryBusRef.update({
                            activeDriverId: request.requester_driver_uid,
                            assignedDriverId: request.requester_driver_uid,
                            activeTripId: null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ Primary bus (${request.bus_number}) restored to ${request.requester_name}`);

                        // Restore SECONDARY bus to candidate
                        const secondaryBusRef = adminDb.collection('buses').doc(request.secondary_bus_id!);
                        await secondaryBusRef.update({
                            activeDriverId: request.candidate_driver_uid,
                            assignedDriverId: request.candidate_driver_uid,
                            activeTripId: null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ Secondary bus (${request.secondary_bus_number}) restored to ${request.candidate_name}`);

                        // Restore requester to primary bus
                        const fromDriverRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                        await fromDriverRef.update({
                            assignedBusId: request.bus_id,
                            busId: request.bus_id,
                            assignedRouteId: request.route_id || null,
                            routeId: request.route_id || null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ ${request.requester_name} restored to ${request.bus_number}`);

                        // Restore candidate to secondary bus
                        const toDriverRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                        await toDriverRef.update({
                            assignedBusId: request.secondary_bus_id,
                            busId: request.secondary_bus_id,
                            assignedRouteId: request.secondary_route_id || null,
                            routeId: request.secondary_route_id || null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ ${request.candidate_name} restored to ${request.secondary_bus_number}`);

                    } else {
                        // Full revert from start (no partial revert was done)
                        console.log('   📋 Reverting TRUE SWAP (full revert)...');
                        console.log(`   ↔️ Restoring: ${request.requester_name} → ${request.bus_number}, ${request.candidate_name} → ${request.secondary_bus_number}`);

                        // Restore PRIMARY bus to requester
                        const primaryBusRef = adminDb.collection('buses').doc(request.bus_id);
                        await primaryBusRef.update({
                            activeDriverId: request.requester_driver_uid,
                            assignedDriverId: request.requester_driver_uid,
                            activeTripId: null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ Primary bus (${request.bus_number}) restored to ${request.requester_name}`);

                        // Restore SECONDARY bus to candidate
                        const secondaryBusRef = adminDb.collection('buses').doc(request.secondary_bus_id!);
                        await secondaryBusRef.update({
                            activeDriverId: request.candidate_driver_uid,
                            assignedDriverId: request.candidate_driver_uid,
                            activeTripId: null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ Secondary bus (${request.secondary_bus_number}) restored to ${request.candidate_name}`);

                        // Restore requester to primary bus
                        const fromDriverRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                        await fromDriverRef.update({
                            assignedBusId: request.bus_id,
                            busId: request.bus_id,
                            assignedRouteId: request.route_id || null,
                            routeId: request.route_id || null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ From driver (${request.requester_name}) restored to ${request.bus_number}`);

                        // Restore candidate to secondary bus
                        const toDriverRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                        await toDriverRef.update({
                            assignedBusId: request.secondary_bus_id,
                            busId: request.secondary_bus_id,
                            assignedRouteId: request.secondary_route_id || null,
                            routeId: request.secondary_route_id || null,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        console.log(`   ✅ To driver (${request.candidate_name}) restored to ${request.secondary_bus_number}`);
                    }
                }
            }

            // If we reached here without returning, the revert was successful
            console.log('✅ Firestore bus/driver ownership reverted successfully');

            // Delete the temporary assignment from Supabase
            await supabase
                .from('temporary_assignments')
                .delete()
                .eq('source_request_id', requestId);

            // If this was a true swap (both drivers had buses), cleanup secondary too
            if (request.secondary_bus_id) {
                await supabase
                    .from('temporary_assignments')
                    .delete()
                    .eq('bus_id', request.secondary_bus_id);
            }

            // Delete the request (cleanup)
            await supabase
                .from('driver_swap_requests')
                .delete()
                .eq('id', requestId);


            console.log('✅ Swap ended and ownership reverted successfully');
            return { success: true };
        } catch (error: any) {
            console.error('❌ Error ending swap:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Expire old pending requests
     */
    static async expirePendingRequests(): Promise<{ expired: number }> {
        try {
            const now = new Date().toISOString();

            // Find and update expired requests
            const { data, error } = await supabase
                .from('driver_swap_requests')
                .update({ status: 'expired' })
                .eq('status', 'pending')
                .lt('expires_at', now)
                .select();

            if (error) {
                console.error('❌ Error expiring requests:', error);
                return { expired: 0 };
            }

            if (data && data.length > 0) {
                console.log(`⏰ Expired ${data.length} pending requests`);
            }
            return { expired: data?.length || 0 };
        } catch (error: any) {
            console.error('❌ Exception expiring requests:', error);
            return { expired: 0 };
        }
    }

    /**
     * Check if driver has any active accepted swaps
     */
    static async hasActiveSwap(driverUid: string): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from('driver_swap_requests')
                .select('id')
                .eq('status', 'accepted')
                .or(`requester_driver_uid.eq.${driverUid},candidate_driver_uid.eq.${driverUid}`)
                .limit(1);

            if (error) {
                console.error('❌ Error checking active swap:', error);
                return false;
            }

            return (data?.length || 0) > 0;
        } catch (error: any) {
            console.error('❌ Exception checking active swap:', error);
            return false;
        }
    }

    /**
     * Check and expire accepted swaps that have passed their end time
     * IMPORTANT: Skips swaps where the driver has an active trip ongoing
     */
    static async checkAndExpireAcceptedSwaps(): Promise<{ expired: number; skipped: number; pendingReverted: number; activated: number }> {
        try {
            const now = new Date().toISOString();

            // 1. First, check for pending_revert swaps (waiting for trips to end)
            const { pendingReverted } = await this.checkPendingRevertSwaps();

            // 2. Check for scheduled swaps that should be ACTIVATED (starts_at reached)
            const { activated } = await this.checkScheduledSwapsToActivate();

            // 3. Find accepted swaps past their end time
            const { data: expiredSwaps, error } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('status', 'accepted')
                .lt('ends_at', now);

            if (error) {
                console.error('❌ Error fetching expired swaps:', error);
                return { expired: 0, skipped: 0, pendingReverted, activated };
            }

            if (!expiredSwaps || expiredSwaps.length === 0) {
                if (pendingReverted > 0 || activated > 0) {
                    console.log(`🔄 Housekeeping: ${pendingReverted} reverted, ${activated} activated`);
                }
                return { expired: 0, skipped: 0, pendingReverted, activated };
            }

            let expired = 0;
            let skipped = 0;

            for (const swap of expiredSwaps) {
                // endSwap will check for active trips and handle appropriately
                const result = await this.endSwap(swap.id, 'system');

                if (result.pendingTripEnd) {
                    // Swap marked as pending_revert (trip ongoing)
                    skipped++;
                    console.log(`⏭️ Swap ${swap.id} marked pending_revert - trip in progress`);
                } else if (result.success) {
                    expired++;
                    console.log(`✅ Auto-ended swap ${swap.id} after period ended`);
                }
            }

            if (expired > 0 || skipped > 0 || pendingReverted > 0 || activated > 0) {
                console.log(`🔄 Housekeeping: ${expired} expired, ${skipped} skipped, ${pendingReverted} reverted, ${activated} activated`);
            }
            return { expired, skipped, pendingReverted, activated };
        } catch (error: any) {
            console.error('❌ Exception checking expired accepted swaps:', error);
            return { expired: 0, skipped: 0, pendingReverted: 0, activated: 0 };
        }
    }

    /**
     * Check for scheduled swaps that should reach their start time and activate them in Firestore
     */
    static async checkScheduledSwapsToActivate(): Promise<{ activated: number }> {
        try {
            const now = new Date().toISOString();
            
            // Find accepted swaps whose starts_at has reached but are not yet reflected in temporary_assignments 
            // OR we can just find all 'accepted' swaps that are near their start time and re-run activation.
            // Activation logic (createTemporaryAssignment) is idempotent for Firestore.
            const { data: scheduledSwaps, error } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('status', 'accepted')
                .lte('starts_at', now); // Time reached or passed

            if (error || !scheduledSwaps || scheduledSwaps.length === 0) {
                return { activated: 0 };
            }

            let activated = 0;
            for (const swap of scheduledSwaps) {
                // Re-run the activation part (Firestore updates)
                // We call createTemporaryAssignment which we modified to handle Firestore updates
                await this.createTemporaryAssignment(swap);
                activated++;
            }

            return { activated };
        } catch (error: any) {
            console.error('❌ Error activating scheduled swaps:', error);
            return { activated: 0 };
        }
    }

    /**
     * Check for swaps in 'pending_revert' status and complete them if trips are now ended
     */
    static async checkPendingRevertSwaps(): Promise<{ pendingReverted: number }> {
        try {
            // Find swaps waiting for trip completion
            const { data: pendingSwaps, error } = await supabase
                .from('driver_swap_requests')
                .select('*')
                .eq('status', 'pending_revert');

            if (error || !pendingSwaps || pendingSwaps.length === 0) {
                return { pendingReverted: 0 };
            }

            let reverted = 0;

            for (const swap of pendingSwaps) {
                // Try to end the swap - it will check for active trips
                const result = await this.endSwap(swap.id, 'system');

                if (result.success && !result.pendingTripEnd) {
                    reverted++;
                    console.log(`✅ Completed pending revert for swap ${swap.id}`);
                }
            }

            return { pendingReverted: reverted };
        } catch (error: any) {
            console.error('❌ Error checking pending revert swaps:', error);
            return { pendingReverted: 0 };
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    private static async createTemporaryAssignment(request: SwapRequest): Promise<void> {
        try {
            // Remove any existing assignment for this bus
            await supabase
                .from('temporary_assignments')
                .delete()
                .eq('bus_id', request.bus_id);

            // Create new assignment in Supabase
            await supabase.from('temporary_assignments').insert({
                bus_id: request.bus_id,
                original_driver_uid: request.requester_driver_uid,
                current_driver_uid: request.candidate_driver_uid,
                route_id: request.route_id || '',
                starts_at: request.starts_at,
                ends_at: request.ends_at,
                active: true,
                created_by: request.requester_driver_uid,
                source_request_id: request.id,
                reason: 'Driver swap request accepted'
            });


            console.log('✅ Temporary assignment created in Supabase');

            // ========== UPDATE FIRESTORE FOR BUS CONTROL TRANSFER ==========
            // This is critical for the driver page to correctly show bus information
            
            const now = new Date();
            const startsAt = new Date(request.starts_at);
            
            // SECURITY/ROBUSTNESS: Only update Firestore if the swap is starting NOW or very soon (within 5 mins)
            // This prevents future swaps from overriding current assignments immediately.
            // Housekeeping task will activate these swaps when their time comes.
            const isStartingNow = startsAt.getTime() <= now.getTime() + 5 * 60 * 1000;
            
            if (!isStartingNow) {
                console.log(`⏳ Swap ${request.id} is scheduled for future (${request.starts_at}). Skipping immediate Firestore update.`);
                return;
            }

            console.log(`🚀 Activating swap ${request.id} immediately as it starts soon/now`);

            const isAssignment = request.swap_type === 'assignment' || !request.secondary_bus_id;

            if (isAssignment) {
                // SCENARIO 1: Assignment to Reserved Driver
                // fromDriver (requester) becomes reserved, toDriver (candidate) takes over the bus
                console.log('   📋 Processing as ASSIGNMENT (to reserved driver)');

                // Update bus document - set candidate as active driver
                const busRef = adminDb.collection('buses').doc(request.bus_id);
                await busRef.update({
                    activeDriverId: request.candidate_driver_uid,
                    assignedDriverId: request.candidate_driver_uid,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ Bus ${request.bus_id} assigned to ${request.candidate_name}`);

                // Update requester (fromDriver) - make them reserved (remove bus assignment)
                const fromDriverRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                await fromDriverRef.update({
                    assignedBusId: null,
                    busId: null,
                    assignedRouteId: null,
                    routeId: null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ From driver (${request.requester_name}) set to reserved`);

                // Update candidate (toDriver) - assign them to the bus
                const toDriverRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                await toDriverRef.update({
                    assignedBusId: request.bus_id,
                    busId: request.bus_id,
                    assignedRouteId: request.route_id || null,
                    routeId: request.route_id || null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ To driver (${request.candidate_name}) assigned to bus ${request.bus_id}`);

            } else {
                // SCENARIO 2: True Swap between two active drivers
                // Both drivers exchange their bus assignments
                console.log('   📋 Processing as TRUE SWAP (both drivers have buses)');
                console.log(`   ↔️ Exchanging: ${request.bus_number} ⟷ ${request.secondary_bus_number}`);

                // Update PRIMARY bus - assign candidate driver
                const primaryBusRef = adminDb.collection('buses').doc(request.bus_id);
                await primaryBusRef.update({
                    activeDriverId: request.candidate_driver_uid,
                    assignedDriverId: request.candidate_driver_uid,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ Primary bus (${request.bus_number}) assigned to ${request.candidate_name}`);

                // Update SECONDARY bus - assign requester driver
                const secondaryBusRef = adminDb.collection('buses').doc(request.secondary_bus_id!);
                await secondaryBusRef.update({
                    activeDriverId: request.requester_driver_uid,
                    assignedDriverId: request.requester_driver_uid,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ Secondary bus (${request.secondary_bus_number}) assigned to ${request.requester_name}`);

                // Update requester (fromDriver) - assign to secondary bus
                const fromDriverRef = adminDb.collection('drivers').doc(request.requester_driver_uid);
                await fromDriverRef.update({
                    assignedBusId: request.secondary_bus_id,
                    busId: request.secondary_bus_id,
                    assignedRouteId: request.secondary_route_id || null,
                    routeId: request.secondary_route_id || null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ From driver (${request.requester_name}) assigned to ${request.secondary_bus_number}`);

                // Update candidate (toDriver) - assign to primary bus
                const toDriverRef = adminDb.collection('drivers').doc(request.candidate_driver_uid);
                await toDriverRef.update({
                    assignedBusId: request.bus_id,
                    busId: request.bus_id,
                    assignedRouteId: request.route_id || null,
                    routeId: request.route_id || null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`   ✅ To driver (${request.candidate_name}) assigned to ${request.bus_number}`);
            }

            console.log('✅ Firestore bus/driver ownership transferred successfully');
        } catch (error) {
            console.error('❌ Error creating temporary assignment:', error);
            throw error; // Re-throw to indicate failure
        }
    }

    private static async sendSwapRequestNotification(
        requestId: string,
        fromDriverName: string,
        toDriverName: string,
        busNumber: string,
        toDriverUID: string
    ): Promise<void> {
        try {
            console.log(`📧 Sending swap request notification to: ${toDriverUID}`);

            const now = new Date();
            const expiresAt = calculateNotificationExpiry(now, NOTIFICATION_TTL_DAYS);

            await adminDb.collection('notifications').add({
                title: '🔄 New Driver Swap Request',
                content: `${fromDriverName} has requested you to take over Bus ${busNumber}. Please visit the Swap Requests page to accept or reject this request.`,
                sender: { userId: 'system', userName: 'System', userRole: 'admin' },
                target: { type: 'specific_users', specificUserIds: [toDriverUID] },
                recipientIds: [toDriverUID],
                autoInjectedRecipientIds: [],
                createdAt: FieldValue.serverTimestamp(),
                expiresAt,
                isEdited: false,
                isDeletedGlobally: false,
                hiddenForUserIds: [],
                readByUserIds: [],
                metadata: {
                    requestId,
                    type: 'swap_request',
                    actionUrl: '/driver/swap-request'
                }
            });

            console.log('✅ Notification sent');
        } catch (error) {
            console.error('❌ Error sending notification:', error);
        }
    }

    private static async sendSwapAcceptedNotifications(request: SwapRequest): Promise<void> {
        try {
            // Notify the requester
            const now = new Date();
            const expiresAt = calculateNotificationExpiry(now, NOTIFICATION_TTL_DAYS);

            await adminDb.collection('notifications').add({
                title: '✅ Swap Request Accepted!',
                content: `${request.candidate_name} has accepted your swap request for Bus ${request.bus_number || request.bus_id}. The swap will be active during the scheduled period.`,
                sender: { userId: 'system', userName: 'System', userRole: 'admin' },
                target: { type: 'specific_users', specificUserIds: [request.requester_driver_uid] },
                recipientIds: [request.requester_driver_uid],
                autoInjectedRecipientIds: [],
                createdAt: FieldValue.serverTimestamp(),
                expiresAt,
                isEdited: false,
                isDeletedGlobally: false,
                hiddenForUserIds: [],
                readByUserIds: [],
                metadata: {
                    requestId: request.id,
                    type: 'swap_accepted',
                    actionUrl: '/driver/swap-request'
                }
            });

            console.log('✅ Swap accepted notifications sent');
        } catch (error) {
            console.error('❌ Error sending accepted notifications:', error);
        }
    }

    private static async sendSwapRejectedNotification(request: SwapRequest): Promise<void> {
        try {
            const now = new Date();
            const expiresAt = calculateNotificationExpiry(now, NOTIFICATION_TTL_DAYS);

            await adminDb.collection('notifications').add({
                title: '❌ Swap Request Declined',
                content: `${request.candidate_name} was unable to accept your swap request for Bus ${request.bus_number || request.bus_id}. You may try requesting another driver.`,
                sender: { userId: 'system', userName: 'System', userRole: 'admin' },
                target: { type: 'specific_users', specificUserIds: [request.requester_driver_uid] },
                recipientIds: [request.requester_driver_uid],
                autoInjectedRecipientIds: [],
                createdAt: FieldValue.serverTimestamp(),
                expiresAt,
                isEdited: false,
                isDeletedGlobally: false,
                hiddenForUserIds: [],
                readByUserIds: [],
                metadata: {
                    requestId: request.id,
                    type: 'swap_rejected',
                    actionUrl: '/driver/swap-request'
                }
            });

            console.log('✅ Swap rejected notification sent');
        } catch (error) {
            console.error('❌ Error sending rejected notification:', error);
        }
    }

    private static async updateActiveTripSession(request: SwapRequest, newDriverUid: string): Promise<void> {
        try {
            console.log('🔄 Checking for active trip session to update...');
            const activeTripsSnapshot = await adminDb
                .collection('trip_sessions')
                .where('busId', '==', request.bus_id)
                .where('endedAt', '==', null)
                .limit(1)
                .get();

            if (!activeTripsSnapshot.empty) {
                const tripDoc = activeTripsSnapshot.docs[0];
                await tripDoc.ref.update({
                    driverUid: newDriverUid,
                    previousDriverUid: request.requester_driver_uid,
                    swappedAt: FieldValue.serverTimestamp()
                });
                console.log(`✅ Updated active trip session ${tripDoc.id} with new driver ${newDriverUid}`);
            } else {
                console.log('ℹ️ No active trip session found to update');
            }
        } catch (error) {
            console.error('❌ Error updating active trip session:', error);
            // Don't throw - this is non-critical for the swap itself
        }
    }

    private static async notifyStudentsOfDriverChange(request: SwapRequest): Promise<void> {
        try {
            console.log(`📢 Notifying students of driver change for Bus ${request.bus_number}`);

            // Get students on this bus
            const studentsSnapshot = await adminDb
                .collection('students')
                .where('busId', '==', request.bus_id)
                .get();

            if (studentsSnapshot.empty) {
                console.log('ℹ️ No students found for this bus');
                return;
            }

            const tokens: string[] = [];
            studentsSnapshot.docs.forEach((doc: any) => {
                const data = doc.data();
                if (data.fcmToken) {
                    tokens.push(data.fcmToken);
                }
            });

            if (tokens.length === 0) {
                console.log('ℹ️ No FCM tokens found for students');
                return;
            }

            const messaging = (await import('firebase-admin/messaging')).getMessaging();

            // Send multicast message
            const response = await messaging.sendEachForMulticast({
                tokens: tokens,
                notification: {
                    title: 'Driver Change Update',
                    body: `${request.candidate_name} will be driving Bus ${request.bus_number || request.bus_id} temporarily.`,
                },
                data: {
                    type: 'DRIVER_CHANGE',
                    busId: request.bus_id,
                    routeId: request.route_id || '',
                    newDriverName: request.candidate_name,
                    requestId: request.id
                }
            });

            console.log(`✅ Sent driver change notification to ${response.successCount} students (${response.failureCount} failed)`);
        } catch (error) {
            console.error('❌ Error notifying students:', error);
            // Don't throw - notification failure shouldn't rollback swap
        }
    }

    /**
     * Broadcast real-time updates to both drivers involved in swap
     */
    private static async broadcastSwapUpdate(
        requestId: string,
        eventType: 'swap_cancelled' | 'swap_rejected' | 'swap_accepted',
        payload: any,
        request?: SwapRequest
    ): Promise<void> {
        try {
            console.log(`📡 Broadcasting ${eventType} for request ${requestId}`);
            
            // Extract driver UIDs from payload or request
            const requesterUID = payload.requesterUID || payload.rejectedBy || payload.cancelledBy || request?.requester_driver_uid;
            const candidateUID = payload.candidateUID || request?.candidate_driver_uid;
            
            if (!requesterUID || !candidateUID) {
                console.error('❌ Cannot broadcast: missing driver UIDs');
                return;
            }
            
            // Send broadcast to both drivers involved
            const channels = [
                supabase.channel(`driver_swap_requests:${requesterUID}`),
                supabase.channel(`driver_swap_requests:${candidateUID}`)
            ];

            for (const channel of channels) {
                await channel.send({
                    type: 'broadcast',
                    event: eventType,
                    payload: {
                        requestId,
                        ...payload
                    }
                });
            }

            console.log(`✅ Broadcast sent for ${eventType}`);
        } catch (error) {
            console.error(`❌ Error broadcasting ${eventType}:`, error);
            // Don't throw - broadcast failure shouldn't rollback the operation
        }
    }
}

export default DriverSwapSupabaseService;
