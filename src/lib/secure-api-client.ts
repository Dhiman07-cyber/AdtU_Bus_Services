import type { User } from 'firebase/auth';

interface AuthFetchOptions extends RequestInit {
    timeoutMs?: number;
    retries?: number;
    baseDelayMs?: number;
    query?: Record<string, string | number | boolean | null | undefined>;
}

export async function authApiFetch(
    currentUser: User | null | undefined,
    input: string,
    options: AuthFetchOptions = {}
): Promise<Response> {
    const { timeoutMs = 12000, query, headers, cache, ...rest } = options;
    const token = currentUser ? await currentUser.getIdToken() : null;

    const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        }
    }

    const maxRetries = options.retries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 1000;
    
    const method = (rest.method || 'GET').toUpperCase();
    const resolvedCache = cache ?? 'no-store';

    // Automatically set Content-Type for JSON mutation requests
    const isMutation = ['POST', 'PUT', 'PATCH'].includes(method);
    const autoHeaders: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/json',
        ...(isMutation && rest.body ? { 'Content-Type': 'application/json' } : {}),
    };

    let attempt = 0;
    
    while (true) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url.toString(), {
                ...rest,
                cache: resolvedCache,
                headers: {
                    ...autoHeaders,
                    ...headers,
                },
                signal: controller.signal,
            });
            
            // Retry on 5xx server errors or 429 Too Many Requests
            if (!response.ok && (response.status >= 500 || response.status === 429)) {
                if (attempt >= maxRetries) return response;
                // Continue to throw logic below
                throw new Error(`Retryable status: ${response.status}`);
            }
            
            return response;
        } catch (error: any) {
            // Check if it's an abort from our timeout
            if (error.name === 'AbortError') {
                if (attempt >= maxRetries) throw error;
            } else if (attempt >= maxRetries) {
                // Out of retries
                throw error;
            }
            
            // Exponential backoff with jitter
            attempt++;
            const delay = baseDelayMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4);
            console.warn(`[API] Request failed, retrying (${attempt}/${maxRetries}) in ${Math.round(delay)}ms...`, url.pathname);
            await new Promise(resolve => setTimeout(resolve, delay));
        } finally {
            clearTimeout(timeout);
        }
    }
}

