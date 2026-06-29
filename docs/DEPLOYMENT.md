# Deployment

This app is a **Next.js 16 app deployed on Vercel** (serverless). There is no
Docker image, no long-running process, and no container orchestration — Vercel
builds from the repo and runs each route as a serverless/edge function. Cron
jobs are Vercel Cron (`vercel.json`), not an in-process scheduler.

## Environment variables

Copy `.env.example` to `.env` for local dev and set the same keys in the Vercel
project settings for production. The server **fails fast at boot** if any
required server secret is missing in production — see
`src/instrumentation.ts` (`REQUIRED_PROD_ENV`).

Required server secrets (production aborts without these):

- Firebase Admin: `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Cloudinary: `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Crypto: `ENCRYPTION_SECRET_KEY`, `SIGNING_SECRET_KEY`, `RECEIPT_SIGNING_SECRET`
- Cron auth: `CRON_SECRET`

The remaining keys in `.env.example` (maps, email, analytics, RSA receipt keys)
are feature-scoped — the features that use them degrade or no-op if unset.

## Deploy

Vercel deploys automatically on push to `main` (production) and per-PR
(preview). To deploy manually:

```bash
vercel --prod
```

Vercel runs `npm run build`. No extra build steps are required.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:

- **Typecheck** (`tsc --noEmit`) — hard gate
- **Test** (`vitest run`) — hard gate
- **Build** (`next build`) — hard gate
- **Lint** (`eslint`) — non-blocking (repo carries pre-existing lint debt)

## Health

- `GET /api/health` — overall status + Supabase connectivity + env check
- `GET /api/health/db` — detailed DB latency

Both return `503` when a dependency check fails, `200` otherwise. Point uptime
monitoring at `/api/health`.

## Startup / shutdown

Serverless: there is no graceful-shutdown step to manage — Vercel freezes/tears
down function instances. Boot-time validation lives in
`src/instrumentation.ts`. Per-subsystem modules (e.g. `firebase-admin.ts`,
`razorpay.service.ts`) also validate their own env lazily on first use.

## Backups

- **Firestore**: use the existing admin export route (`/api/admin/export-firestore`)
  or `gcloud firestore export` against the project bucket.
- **Supabase**: `supabase db dump` (CLI) or the scheduled backups in the
  Supabase dashboard.
- **Secrets**: keep `.env` values in the team password manager; they are not in
  source control.
