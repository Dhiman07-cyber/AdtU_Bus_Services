// Server-side upload functions that can use cloudinary directly
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export const uploadImageServer = async (file: File, folder: string = 'adtu'): Promise<string | null> => {
  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataURI = `data:${file.type};base64,${base64}`;
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      use_filename: true,
      unique_filename: false,
      overwrite: true
    });
    
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    return null;
  }
};

export const uploadImageWithPresetServer = async (file: File, preset: string): Promise<string | null> => {
  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataURI = `data:${file.type};base64,${base64}`;
    
    // Upload to Cloudinary with unsigned preset
    const result = await cloudinary.uploader.upload(dataURI, {
      upload_preset: preset,
      use_filename: true,
      unique_filename: false,
      overwrite: true
    });
    
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    return null;
  }
};