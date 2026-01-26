// Mobile device detection and optimization utilities

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Enhanced mobile detection
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isSmallScreen = window.innerWidth <= 768;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return isMobileUA || (isSmallScreen && isTouchDevice);
};

export const compressImageForMobile = async (file: File, maxSizeMB: number = 2): Promise<File> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions to reduce file size
      let { width, height } = img;
      const maxDimension = isMobileDevice() ? 1200 : 1920;
      
      if (width > height && width > maxDimension) {
        height = (height * maxDimension) / width;
        width = maxDimension;
      } else if (height > maxDimension) {
        width = (width * maxDimension) / height;
        height = maxDimension;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            resolve(file); // Fallback to original if compression fails
          }
        },
        file.type,
        isMobileDevice() ? 0.7 : 0.8 // Lower quality for mobile
      );
    };
    
    img.onerror = () => resolve(file); // Fallback to original if image load fails
    img.src = URL.createObjectURL(file);
  });
};

export const getMobileOptimizedTimeout = (baseTimeout: number): number => {
  return isMobileDevice() ? baseTimeout * 1.5 : baseTimeout;
};

export const getMobileOptimizedChunkSize = (): number => {
  return isMobileDevice() ? 1024 * 1024 : 2 * 1024 * 1024; // 1MB for mobile, 2MB for desktop
};