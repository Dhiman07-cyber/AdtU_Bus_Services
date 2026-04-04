"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { logMapObservability } from '@/lib/maps/map-observability';

type Status = 'idle' | 'loading' | 'ready' | 'failed';

let sessionKey: string | null = null;
let sessionPromise: Promise<string | null> | null = null;

async function fetchKey(getIdToken: () => Promise<string | null>): Promise<string | null> {
    const token = await getIdToken();
    if (!token) {
        logMapObservability({ category: 'auth', code: 'google_maps_client_no_token' });
        return null;
    }
    const res = await fetch('/api/maps/google-client-config', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
    });
    if (!res.ok) {
        logMapObservability({ category: 'network', code: 'google_maps_client_http', detail: { status: res.status } });
        return null;
    }
    const data = await res.json();
    if (data?.ok === true && typeof data.apiKey === 'string' && data.apiKey.length > 0) {
        return data.apiKey;
    }
    return null;
}

/**
 * Lazy Google Maps key: fetched at runtime (not baked into the client bundle).
 * Reuses one key per browser session when possible.
 */
export function useGoogleMapsClientKey(active: boolean, getIdToken: () => Promise<string | null>) {
    const [status, setStatus] = useState<Status>('idle');
    const [apiKey, setApiKey] = useState('');
    const attemptRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        if (!active) return;

        if (sessionKey) {
            setApiKey(sessionKey);
            setStatus('ready');
            return;
        }

        if (sessionPromise) {
            setStatus('loading');
            const k = await sessionPromise;
            if (k) {
                sessionKey = k;
                setApiKey(k);
                setStatus('ready');
            } else {
                setStatus('failed');
            }
            return;
        }

        setStatus('loading');
        sessionPromise = fetchKey(getIdToken);
        try {
            const k = await sessionPromise;
            if (k) {
                sessionKey = k;
                setApiKey(k);
                setStatus('ready');
                attemptRef.current = 0;
            } else {
                setStatus('failed');
            }
        } finally {
            sessionPromise = null;
        }
    }, [active, getIdToken]);

    useEffect(() => {
        if (!active) {
            setStatus('idle');
            return;
        }
        void load();
        return () => {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        };
    }, [active, load]);

    const retry = useCallback(() => {
        if (!active) return;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const n = Math.min(5, attemptRef.current + 1);
        attemptRef.current = n;
        const delay = Math.min(30_000, 2000 * 2 ** (n - 1));
        sessionKey = null;
        sessionPromise = null;
        setStatus('loading');
        retryTimerRef.current = setTimeout(() => {
            void load();
        }, delay);
    }, [active, load]);

    return { status, apiKey, retry, reload: load };
}
