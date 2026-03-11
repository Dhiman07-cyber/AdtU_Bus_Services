/**
 * Cloudinary Client-Side Configuration Check
 * ────────────────────────────────────────────
 * This file exists for backward compatibility.
 *
 * SECURITY: All Cloudinary operations (upload, delete, URL signing) happen
 * server-side via src/lib/cloudinary-server.ts.
 * The client NEVER has access to CLOUDINARY_API_SECRET.
 *
 * If you need the Cloudinary SDK, import from '@/lib/cloudinary-server'
 * (server-only — API routes).
 */

// Re-export nothing meaningful — prevents accidental client-side SDK usage.
export default {
  config: () => { },
  uploader: {
    upload_stream: () => { },
  },
  api: {
    ping: () => Promise.resolve({ status: 'ok' }),
  },
};