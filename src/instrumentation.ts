// Next.js native startup hook — runs once when the server boots (Node runtime).
// Centralizes fail-fast env validation so production aborts at deploy/boot
// instead of throwing on the first user request that touches a subsystem.
// Per-subsystem modules (firebase-admin, razorpay, etc.) still validate their
// own vars lazily; this is the single up-front gate.

// Server secrets that production genuinely cannot run without. Sourced from the
// subsystems that throw on their absence (firebase-admin, razorpay.service,
// crypto signing, cron auth, supabase service role). Public NEXT_PUBLIC_* vars
// are validated by the existing /api/health endpoint and Firebase init.
const REQUIRED_PROD_ENV = [
  // Firebase Admin
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  // Supabase
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  // Razorpay (payments)
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  // Cloudinary (server uploads)
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  // Cryptographic secrets (receipts / encryption / signing)
  'ENCRYPTION_SECRET_KEY',
  'SIGNING_SECRET_KEY',
  'RECEIPT_SIGNING_SECRET',
  // Document signing keys
  'DOCUMENT_PRIVATE_KEY',
  'DOCUMENT_PUBLIC_KEY',
  // Cron authentication
  'CRON_SECRET',
] as const;

export function register(): void {
  // Only the Node.js server runtime — skip edge runtime and the browser.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const missing = REQUIRED_PROD_ENV.filter((key) => !process.env[key]);
  if (missing.length === 0) return;

  const msg = `❌ Missing required server env vars: ${missing.join(', ')}`;
  // Fail the boot in production; warn (don't block local dev) otherwise.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  }
  console.warn(msg);
}
