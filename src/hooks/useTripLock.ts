/**
 * useTripLock Hook (Simplified)
 * 
 * React hook for managing trip lock state and operations.
 * Fully automatic - no admin intervention needed.
 * 
 * Handles:
 * - Checking if driver can operate a bus
 * - Starting trips with lock acquisition
 * - Heartbeat management
 * - Ending trips with cleanup
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';

// Types
interface TripState {
    isActive: boolean;
    tripId: string | null;
    busId: string | null;
    routeId: string | null;
    shift: 'morning' | 'evening' | 'both' | null;
    startedAt: string | null;
}

interface UseTripLockReturn {
    // State
    tripState: TripState;
    isLoading: boolean;
    error: string | null;
    canOperate: boolean | null;
    lockDenialReason: string | null;

    // Actions
    checkCanOperate: (busId: string) => Promise<boolean>;
    startTrip: (busId: string, routeId: string, shift?: 'morning' | 'evening' | 'both') => Promise<boolean>;
    endTrip: () => Promise<boolean>;

    // Heartbeat status
    heartbeatStatus: 'active' | 'failed' | 'stopped';
    lastHeartbeat: string | null;
}

// Heartbeat interval in milliseconds (1 minute)
const HEARTBEAT_INTERVAL = 60000;

export function useTripLock(): UseTripLockReturn {
    const { currentUser } = useAuth();

    // State
    const [tripState, setTripState] = useState<TripState>({
        isActive: false,
        tripId: null,
        busId: null,
        routeId: null,
        shift: null,
        startedAt: null
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [canOperate, setCanOperate] = useState<boolean | null>(null);
    const [lockDenialReason, setLockDenialReason] = useState<string | null>(null);
    const [heartbeatStatus, setHeartbeatStatus] = useState<'active' | 'failed' | 'stopped'>('stopped');
    const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

    // Refs
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const heartbeatFailCountRef = useRef(0);

    /**
     * Check if driver can operate a bus
     */
    const checkCanOperate = useCallback(async (busId: string): Promise<boolean> => {
        if (!currentUser) {
            setError('Not authenticated');
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            const idToken = await currentUser.getIdToken();

            const response = await fetch('/api/driver/can-operate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, busId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to check operation status');
            }

            setCanOperate(data.allowed);
            setLockDenialReason(data.allowed ? null : data.reason);

            return data.allowed;

        } catch (err: any) {
            setError(err.message);
            setCanOperate(false);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [currentUser]);

    /**
     * Start a trip with lock acquisition
     */
    const startTrip = useCallback(async (
        busId: string,
        routeId: string,
        shift: 'morning' | 'evening' | 'both' = 'both'
    ): Promise<boolean> => {
        if (!currentUser) {
            setError('Not authenticated');
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            const idToken = await currentUser.getIdToken();

            const response = await fetch('/api/driver/start-trip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idToken,
                    busId,
                    routeId,
                    shift
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 409) {
                    setError('This bus is currently being operated by another driver. Please wait or try again later.');
                } else {
                    setError(data.reason || data.error || 'Failed to start trip');
                }
                return false;
            }

            // Update trip state
            setTripState({
                isActive: true,
                tripId: data.tripId,
                busId,
                routeId,
                shift,
                startedAt: data.timestamp
            });

            // Start heartbeat
            startHeartbeat(data.tripId, busId);

            return true;

        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [currentUser]);

    /**
     * End a trip and release lock
     */
    const endTrip = useCallback(async (): Promise<boolean> => {
        if (!currentUser || !tripState.isActive || !tripState.busId) {
            setError('No active trip to end');
            return false;
        }

        setIsLoading(true);
        setError(null);

        // Stop heartbeat first
        stopHeartbeat();

        try {
            const idToken = await currentUser.getIdToken();

            const response = await fetch('/api/driver/end-trip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idToken,
                    tripId: tripState.tripId,
                    busId: tripState.busId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to end trip');
                return false;
            }

            // Reset trip state
            setTripState({
                isActive: false,
                tripId: null,
                busId: null,
                routeId: null,
                shift: null,
                startedAt: null
            });

            return true;

        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, tripState]);

    /**
     * Send heartbeat
     */
    const sendHeartbeat = useCallback(async (tripId: string, busId: string): Promise<void> => {
        if (!currentUser) return;

        try {
            const idToken = await currentUser.getIdToken();

            const response = await fetch('/api/driver/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, tripId, busId })
            });

            if (response.ok) {
                setHeartbeatStatus('active');
                setLastHeartbeat(new Date().toISOString());
                heartbeatFailCountRef.current = 0;
            } else {
                heartbeatFailCountRef.current++;
                if (heartbeatFailCountRef.current >= 3) {
                    setHeartbeatStatus('failed');
                    setError('Lost connection to server. Your trip session may have expired.');
                }
            }

        } catch (err) {
            heartbeatFailCountRef.current++;
            if (heartbeatFailCountRef.current >= 3) {
                setHeartbeatStatus('failed');
            }
        }
    }, [currentUser]);

    /**
     * Start heartbeat interval
     */
    const startHeartbeat = useCallback((tripId: string, busId: string) => {
        setHeartbeatStatus('active');
        heartbeatFailCountRef.current = 0;

        // Clear existing interval
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }

        // Send initial heartbeat
        sendHeartbeat(tripId, busId);

        // Start interval
        heartbeatIntervalRef.current = setInterval(() => {
            sendHeartbeat(tripId, busId);
        }, HEARTBEAT_INTERVAL);
    }, [sendHeartbeat]);

    /**
     * Stop heartbeat interval
     */
    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        setHeartbeatStatus('stopped');
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
        };
    }, []);

    // Handle page visibility change - pause/resume heartbeat
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && tripState.isActive) {
                // Page hidden - heartbeat continues in background but may be delayed
                console.log('Page hidden, heartbeat may be delayed');
            } else if (!document.hidden && tripState.isActive && tripState.tripId && tripState.busId) {
                // Page visible again - send immediate heartbeat
                sendHeartbeat(tripState.tripId, tripState.busId);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [tripState, sendHeartbeat]);

    return {
        tripState,
        isLoading,
        error,
        canOperate,
        lockDenialReason,
        checkCanOperate,
        startTrip,
        endTrip,
        heartbeatStatus,
        lastHeartbeat
    };
}

export default useTripLock;
