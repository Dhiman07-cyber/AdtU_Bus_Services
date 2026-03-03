import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { verifyTokenOnly } from '@/lib/security/api-auth';
import { checkRateLimit, createRateLimitId } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/** Allowed image MIME types */
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
/** Maximum file size: 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
/** Allowed Cloudinary folder names */
const ALLOWED_FOLDERS = ['adtu', 'ADTU', 'profiles', 'receipts'];

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
    const rateCheck = checkRateLimit(rateLimitId, 5, 60000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait before trying again.' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = (formData.get('folder') as string) || 'adtu';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // SECURITY: Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // SECURITY: Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit.' },
        { status: 400 }
      );
    }

    // SECURITY: Validate and sanitize folder name
    const sanitizedFolder = ALLOWED_FOLDERS.includes(folder) ? folder : 'adtu';

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataURI = `data:${file.type};base64,${base64}`;

    // Upload to Cloudinary with unique filename
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: sanitizedFolder,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
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