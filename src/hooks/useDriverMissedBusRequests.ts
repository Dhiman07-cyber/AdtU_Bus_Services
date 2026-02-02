/**
 * useDriverMissedBusRequests Hook
 * 
 * React hook for drivers to view and respond to missed-bus pickup requests.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface MissedBusRequest {
    id: string;
    studentId: string;
    routeId: string;
    stopId: string;
    studentSequence: number;
    createdAt: string;
    expiresAt: string;
}

interface UseDriverMissedBusReturn {
    // State
    loading: boolean;
    pendingRequests: MissedBusRequest[];

    // Actions
    respondToRequest: (requestId: string, decision: 'accept' | 'reject') => Promise<{
        success: boolean;
        result: string;
        message?: string;
    }>;
    refreshRequests: () => Promise<void>;
}

export function useDriverMissedBusRequests(
    getIdToken: () => Promise<string | null>,
    driverId: string | null,
    activeTripId: string | null
): UseDriverMissedBusReturn {
    const [loading, setLoading] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<MissedBusRequest[]>([]);

    // Refresh pending requests from server
    const refreshRequests = useCallback(async () => {
        if (!driverId || !activeTripId) {
            setPendingRequests([]);
            return;
        }

        setLoading(true);

        try {
            const token = await getIdToken();
            if (!token) {
                setLoading(false);
                return;
            }

            const response = await fetch('/api/missed-bus/driver-requests', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                setPendingRequests(data.requests || []);
            } else {
                setPendingRequests([]);
            }

        } catch (err: any) {
            console.error('Error fetching missed-bus requests:', err);
            setPendingRequests([]);
        } finally {
            setLoading(false);
        }
    }, [getIdToken, driverId, activeTripId]);

    // Respond to a request (accept/reject)
    const respondToRequest = useCallback(async (
        requestId: string,
        decision: 'accept' | 'reject'
    ) => {
        setLoading(true);

        try {
            const token = await getIdToken();
            if (!token) {
                setLoading(false);
                return {
                    success: false,
                    result: 'error',
                    message: 'Not authenticated'
                };
            }

            const response = await fetch('/api/missed-bus/driver-response', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    idToken: token,
                    requestId,
                    decision
                })
            });

            const data = await response.json();

            // Refresh requests after responding
            await refreshRequests();

            setLoading(false);
            return {
                success: data.success,
                result: data.result,
                message: data.message
            };

        } catch (err: any) {
            console.error('Error responding to missed-bus request:', err);
            setLoading(false);
            return {
                success: false,
                result: 'error',
                message: 'Failed to send response'
            };
        }
    }, [getIdToken, refreshRequests]);

    // Subscribe to realtime updates for new requests
    useEffect(() => {
        if (!driverId || !activeTripId) return;

        // Subscribe to new missed_bus_requests where we might be a candidate
        const channel = supabase
            .channel(`driver_missed_bus_${driverId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'missed_bus_requests'
                },
                (payload) => {
                    // Check if this driver's trip is in candidates
                    const newRequest = payload.new as any;
                    const candidates = newRequest.trip_candidates || [];
                    const isCandidate = candidates.some(
                        (c: any) => c.tripId === activeTripId
                    );

                    if (isCandidate && newRequest.status === 'pending') {
                        // Add to pending requests
                        setPendingRequests(prev => {
                            // Avoid duplicates
                            if (prev.some(r => r.id === newRequest.id)) {
                                return prev;
                            }
                            return [...prev, {
                                id: newRequest.id,
                                studentId: newRequest.student_id,
                                routeId: newRequest.route_id,
                                stopId: newRequest.stop_id,
                                studentSequence: newRequest.student_sequence,
                                createdAt: newRequest.created_at,
                                expiresAt: newRequest.expires_at
                            }];
                        });
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'missed_bus_requests'
                },
                (payload) => {
                    // Remove request if it's no longer pending
                    const updated = payload.new as any;
                    if (updated.status !== 'pending') {
                        setPendingRequests(prev =>
                            prev.filter(r => r.id !== updated.id)
                        );
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [driverId, activeTripId]);

    // Initial fetch
    useEffect(() => {
        if (driverId && activeTripId) {
            refreshRequests();
        }
    }, [driverId, activeTripId, refreshRequests]);

    return {
        loading,
        pendingRequests,
        respondToRequest,
        refreshRequests
    };
}
