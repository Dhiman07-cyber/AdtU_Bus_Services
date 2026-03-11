/**
 * POST /api/upload-image — Authenticated Cloudinary Upload (Secondary Route)
 * ─────────────────────────────────────────────────────────────────────────────
 * This route uses server-side SDK upload (same as /api/upload).
 * It existed before the hardening — now consolidated to use the shared
 * cloudinary-server module and centralised validators.
 *
 * SECURITY:
 *  - Firebase token verification
 *  - Rate-limited (5 per minute per user)
 *  - MIME allowlist (no GIF – was inconsistent before)
 *  - Folder allowlist
 *  - Server-generated unique filename
 *  - Overwrite disabled
 *  - EXIF/metadata stripped
 */

import { NextRequest, NextResponse } from 'next/server';
import cloudinary, {
  sanitizeFolder,
  isAllowedMimeType,
  isAllowedSize,
  MAX_FILE_SIZE,
} from '@/lib/cloudinary-server';
import { verifyTokenOnly } from '@/lib/security/api-auth';
import { checkRateLimit, createRateLimitId } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify authentication
    const user = await verifyTokenOnly(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // SECURITY: Rate limit uploads (5 per minute)
    const rateLimitId = createRateLimitId(user.uid, 'upload-image');
    const rateCheck = checkRateLimit(rateLimitId, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait before trying again.' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const rawFolder = formData.get('folder') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // SECURITY: Validate file type (allowlist)
    if (!isAllowedMimeType(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // SECURITY: Validate file size
    if (!isAllowedSize(file.size)) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.` },
        { status: 400 }
      );
    }

    // SECURITY: Validate and sanitize folder name
    const folder = sanitizeFolder(rawFolder);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataURI = `data:${file.type};base64,${base64}`;

    // Upload to Cloudinary with unique filename
    const result = await cloudinary.uploader.upload(dataURI, {
      folder,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      resource_type: 'image',
      // SECURITY: Strip all metadata from uploaded images
      transformation: [{ flags: 'strip_profile' }],
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (error: any) {
    console.error('Error uploading image to Cloudinary:', error);
    return NextResponse.json(
      handleApiError(error, 'upload-image', 'Failed to upload image'),
      { status: 500 }
    );
  }
}