import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const oldImageUrl = formData.get('oldImageUrl') as string || '';
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' 
      }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ 
        error: 'File size too large. Maximum file size is 5MB.' 
      }, { status: 400 });
    }

    // Delete old image from Cloudinary if it exists
    if (oldImageUrl && cloudinary.config().api_key) {
      try {
        // Extract public ID from old Cloudinary URL
        const url = new URL(oldImageUrl);
        const pathParts = url.pathname.split('/');
        const fileName = pathParts.filter(part => part.length > 0).pop();
        if (fileName) {
          const publicId = fileName.split('.').slice(0, -1).join('.');
          const fullPublicId = `ADTU/${publicId}`;
          
          // Delete from Cloudinary
          await cloudinary.uploader.destroy(fullPublicId);
          console.log(`Successfully deleted old image: ${fullPublicId}`);
        }
      } catch (cloudinaryError) {
        console.error('Error deleting old image from Cloudinary:', cloudinaryError);
      }
    }

    // Get Cloudinary configuration from environment variables
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      console.error('Cloudinary configuration is missing:', {
        cloudName: !!cloudName,
        uploadPreset: !!uploadPreset
      });
      return NextResponse.json({ 
        error: 'Cloudinary configuration is missing. Please check your environment variables.' 
      }, { status: 500 });
    }

    // Create new FormData for Cloudinary API request
    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append("file", file);
    cloudinaryFormData.append("upload_preset", uploadPreset);
    cloudinaryFormData.append("folder", "ADTU");
    cloudinaryFormData.append("public_id", `profile_${Date.now()}_${Math.floor(Math.random() * 10000)}`);

    console.log('Uploading to Cloudinary with config:', {
      cloudName,
      folder: "ADTU",
      uploadPreset
    });

    // Upload directly to Cloudinary API
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: cloudinaryFormData
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Cloudinary upload failed:', {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`Cloudinary upload failed with status ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    console.log('Cloudinary upload successful:', {
      public_id: data.public_id,
      url: data.secure_url ? 'URL present' : 'URL missing'
    });

    // Validate the result
    if (!data.secure_url) {
      throw new Error('Upload succeeded but no URL was returned');
    }

    return NextResponse.json({ 
      url: data.secure_url,
      public_id: data.public_id
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}