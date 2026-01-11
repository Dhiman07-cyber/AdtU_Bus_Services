// This file is kept for backward compatibility but is no longer used for uploads
// Uploads are now handled directly through the Cloudinary API endpoint

// Add validation to check if Cloudinary is properly configured
if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  console.warn('Cloudinary cloud name is not set in environment variables');
}

if (!process.env.CLOUDINARY_API_KEY) {
  console.warn('Cloudinary API key is not set in environment variables');
}

if (!process.env.CLOUDINARY_API_SECRET) {
  console.warn('Cloudinary API secret is not set in environment variables');
}

// Log configuration for debugging (without exposing secrets)
console.log('Cloudinary configuration check:', {
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'NOT SET',
  api_key: process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET',
  upload_preset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'NOT SET'
});

// Export a dummy object to maintain compatibility
export default {
  config: () => {},
  uploader: {
    upload_stream: () => {}
  },
  api: {
    ping: () => Promise.resolve({ status: 'ok' })
  }
};