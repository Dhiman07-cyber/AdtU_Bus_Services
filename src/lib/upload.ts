import { isMobileDevice, compressImageForMobile } from './mobile-utils';

// Client-side upload function that uses the mobile-optimized API route
export const uploadImage = async (file: File, folder: string = 'adtu'): Promise<string | null> => {
  try {
    console.log('📤 [uploadImage] Starting upload:', {
      fileName: file.name,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      fileType: file.type,
      isMobile: isMobileDevice()
    });

    // Mobile optimization: Compress image if on mobile device
    let processedFile = file;
    if (isMobileDevice() && file.size > 1 * 1024 * 1024) { // 1MB threshold for mobile
      console.log('📱 Mobile device detected, compressing image...');
      processedFile = await compressImageForMobile(file, 2);
      console.log(`📱 Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`);
    }

    const formData = new FormData();
    formData.append('file', processedFile);
    formData.append('folder', folder);

    // Mobile-specific timeout and retry logic
    const maxRetries = isMobileDevice() ? 2 : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Upload attempt ${attempt}/${maxRetries}`);
        
        if (attempt > 1) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        const response = await Promise.race([
          fetch('/api/upload', {
            method: 'POST',
            body: formData,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout')), 30000) // 30 second timeout
          )
        ]) as Response;

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ [uploadImage] Upload successful:', data.url);
        return data.url;
      } catch (uploadError: any) {
        console.error(`❌ Upload attempt ${attempt} failed:`, uploadError);
        lastError = uploadError;
        
        if (uploadError.message === 'Upload timeout') {
          lastError = new Error('Upload timed out. Please try with a smaller image or better network connection.');
        } else if (uploadError.name === 'TypeError' && uploadError.message.includes('fetch')) {
          lastError = new Error('Network error during upload. Please check your internet connection and try again.');
        }
        
        // Don't retry on certain errors
        if (uploadError.message.includes('File size too large') || 
            uploadError.message.includes('Invalid file type')) {
          break;
        }
      }
    }

    if (lastError) {
      console.error('❌ [uploadImage] All upload attempts failed:', lastError.message);
      throw lastError;
    }

    return null;
  } catch (error: any) {
    console.error('❌ [uploadImage] Error:', error);
    return null;
  }
};

export const uploadImageWithPreset = async (file: File, preset: string): Promise<string | null> => {
  // For client-side uploads with presets, we would need a separate API route
  // For now, we'll just use the regular upload function
  return uploadImage(file, 'adtu');
};