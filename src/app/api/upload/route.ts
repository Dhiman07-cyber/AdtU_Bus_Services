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
    console.log('📥 [Upload API] Request received');
    
    // Mobile optimization: Add request timeout handling
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Server timeout')), 25000) // 25 second server timeout
    );
    
    const processRequest = async () => {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const oldImageUrl = formData.get('oldImageUrl') as string || '';

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      console.log('📁 [Upload API] File details:', {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: file.type
      });

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
            console.log(`✅ [Upload API] Deleted old image: ${fullPublicId}`);
          }
        } catch (cloudinaryError) {
          console.error('⚠️ [Upload API] Error deleting old image:', cloudinaryError);
        }
      }

      // Get Cloudinary configuration from environment variables
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName || !uploadPreset) {
        console.error('❌ [Upload API] Cloudinary config missing:', {
          cloudName: !!cloudName,
          uploadPreset: !!uploadPreset
        });
        return NextResponse.json({
          error: 'Cloudinary configuration is missing. Please check your environment variables.'
        }, { status: 500 });
      }

      const folder = (formData.get('folder') as string) || "ADTU";

      // Create new FormData for Cloudinary API request
      const cloudinaryFormData = new FormData();
      cloudinaryFormData.append("file", file);
      cloudinaryFormData.append("upload_preset", uploadPreset);
      cloudinaryFormData.append("folder", folder);
      cloudinaryFormData.append("public_id", `profile_${Date.now()}_${Math.floor(Math.random() * 10000)}`);

      console.log('🚀 [Upload API] Uploading to Cloudinary...');

      // Upload directly to Cloudinary API with mobile-friendly timeout
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: cloudinaryFormData,
        // Mobile optimization: Add signal for timeout
        signal: AbortSignal.timeout(20000) // 20 second timeout for Cloudinary
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ [Upload API] Cloudinary upload failed:', {
          status: res.status,
          statusText: res.statusText,
          errorText: errorText.substring(0, 200)
        });
        throw new Error(`Cloudinary upload failed with status ${res.status}`);
      }

      const data = await res.json();
      console.log('✅ [Upload API] Upload successful');

      // Validate the result
      if (!data.secure_url) {
        throw new Error('Upload succeeded but no URL was returned');
      }

      return NextResponse.json({
        url: data.secure_url,
        public_id: data.public_id
      });
    };

    // Race between processing and timeout
    return await Promise.race([processRequest(), timeoutPromise]);
    
  } catch (error: any) {
    console.error('❌ [Upload API] Error:', error);
    
    if (error.name === 'AbortError' || error.message === 'Server timeout') {
      return NextResponse.json({ 
        error: 'Upload timed out. Please try with a smaller image or better network connection.' 
      }, { status: 408 });
    }
    
    return NextResponse.json({ 
      error: error.message || 'Upload failed' 
    }, { status: 500 });
  }
}