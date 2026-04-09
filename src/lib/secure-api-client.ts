import type { User } from 'firebase/auth';

interface AuthFetchOptions extends RequestInit {
    timeoutMs?: number;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const method = (rest.method || 'GET').toUpperCase();
    const resolvedCache = cache ?? 'no-store';

    try {
        return await fetch(url.toString(), {
            ...rest,
            cache: resolvedCache,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}
