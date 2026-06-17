type LogMeta = Record<string, unknown>;

const SENSITIVE_KEY_RE = /(token|secret|password|private|signature|phone|email|key|authorization)/i;

function maskValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_RE.test(key)) {
    if (typeof value === 'string' && value.length > 8) {
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    return '[redacted]';
  }

  if (Array.isArray(value)) return value.slice(0, 20).map((item) => maskUnknown(item));
  if (value && typeof value === 'object') return maskUnknown(value);
  return value;
}

function maskUnknown(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const output: LogMeta = {};
  for (const [key, child] of Object.entries(value as LogMeta)) {
    output[key] = maskValue(key, child);
  }
  return output;
}

function write(level: 'info' | 'warn' | 'error', message: string, meta?: LogMeta) {
  if (level === 'info' && process.env.NODE_ENV === 'production') return;
  const safeMeta = meta ? maskUnknown(meta) : undefined;
  if (safeMeta) console[level](message, safeMeta);
  else console[level](message);
}

export const serverLogger = {
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
};
