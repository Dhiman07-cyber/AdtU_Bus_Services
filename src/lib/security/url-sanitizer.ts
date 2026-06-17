const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const TRUSTED_IMAGE_HOSTS = new Set([
  'res.cloudinary.com',
  'lh3.googleusercontent.com',
  'api.dicebear.com',
  'firebasestorage.googleapis.com',
]);

const TRUSTED_IMAGE_HOST_SUFFIXES = [
  '.supabase.co',
  '.supabase.in',
  '.googleusercontent.com',
];

const SAFE_PATH_RE = /^\/(?!\/)(?!\\)[^\u0000-\u001f\u007f]*$/;
const SAFE_EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const SAFE_PHONE_RE = /^\+?\d{7,15}$/;

function parseUrl(value: unknown, base?: string): URL | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    return new URL(trimmed, base);
  } catch {
    return null;
  }
}

function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && LOCALHOST_HOSTS.has(url.hostname);
}

function isAllowedHttpUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  return process.env.NODE_ENV !== 'production' && isLocalHttp(url);
}

function hostMatches(hostname: string, allowedHosts?: Iterable<string>): boolean {
  if (!allowedHosts) return true;
  const normalized = hostname.toLowerCase();
  for (const host of allowedHosts) {
    if (normalized === host.toLowerCase()) return true;
  }
  return false;
}

export function safeExternalUrl(value: unknown, allowedHosts?: Iterable<string>): string | null {
  const url = parseUrl(value);
  if (!url || !isAllowedHttpUrl(url) || !hostMatches(url.hostname, allowedHosts)) {
    return null;
  }
  return url.toString();
}

export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (SAFE_PATH_RE.test(trimmed)) return trimmed;
  return safeExternalUrl(trimmed);
}

export function sanitizeRedirectPath(path: unknown, fallback = '/'): string {
  if (typeof path !== 'string') return fallback;
  const trimmed = path.trim();
  if (!SAFE_PATH_RE.test(trimmed)) return fallback;
  if (trimmed.startsWith('/api/') || trimmed.includes('\\')) return fallback;
  return trimmed;
}

export function safeTelHref(phone: unknown): string | null {
  if (typeof phone !== 'string' && typeof phone !== 'number') return null;
  const normalized = String(phone).replace(/[\s().-]/g, '');
  if (!SAFE_PHONE_RE.test(normalized)) return null;
  return `tel:${normalized}`;
}

export function safeMailtoHref(email: unknown, options?: { subject?: string; body?: string }): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  if (!SAFE_EMAIL_RE.test(trimmed) || trimmed.length > 320) return null;

  const params = new URLSearchParams();
  if (options?.subject) params.set('subject', options.subject.slice(0, 200));
  if (options?.body) params.set('body', options.body.slice(0, 2000));
  const query = params.toString();
  return `mailto:${trimmed}${query ? `?${query}` : ''}`;
}

export function safeImageSrc(value: unknown, fallback = '/icons/icon-192x192.png'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (SAFE_PATH_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;

  const url = parseUrl(trimmed);
  if (!url || !isAllowedHttpUrl(url)) return fallback;

  const host = url.hostname.toLowerCase();
  const trusted = TRUSTED_IMAGE_HOSTS.has(host) || TRUSTED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  return trusted ? url.toString() : fallback;
}

export function safeDownloadUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('blob:')) return trimmed;
  if (SAFE_PATH_RE.test(trimmed)) return trimmed;
  return safeExternalUrl(trimmed);
}
