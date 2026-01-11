import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await adminAuth.verifyIdToken(token);

    const body = await request.json();
    const { publicId } = body;

    if (!publicId) {
      return NextResponse.json({ error: 'Missing public ID' }, { status: 400 });
    }

    // Call Cloudinary API to delete the image
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/destroy`;
    
    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', process.env.CLOUDINARY_API_KEY || '');
    formData.append('api_secret', process.env.CLOUDINARY_API_SECRET || '');
    formData.append('timestamp', Math.floor(Date.now() / 1000).toString());

    const response = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      const errorData = await response.json();
      console.error('Cloudinary delete error:', errorData);
      return NextResponse.json({
        success: false,
        message: 'Failed to delete image from Cloudinary'
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete image' },
      { status: 500 }
    );
  }
}
