/**
 * Mobile Error Handler
 * Prevents silent crashes on mobile by catching unhandled errors
 */

let isInitialized = false;

/**
 * Initialize mobile error handling
 * Call this once in your root layout or app component
 */
export function initMobileErrorHandler() {
  if (isInitialized || typeof window === 'undefined') {
    return;
  }

  console.log('📱 Initializing mobile error handler...');

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled Promise Rejection:', event.reason);
    
    // Prevent the default behavior (which might crash the app)
    event.preventDefault();
    
    // Log to console for debugging
    if (event.reason instanceof Error) {
      console.error('Error details:', {
        message: event.reason.message,
        stack: event.reason.stack,
        name: event.reason.name
      });
    }
    
    // You can send this to an error tracking service here
    // For now, just log it
    try {
      // Store in sessionStorage for debugging
      const errors = JSON.parse(sessionStorage.getItem('app_errors') || '[]');
      errors.push({
        type: 'unhandledrejection',
        message: event.reason?.message || String(event.reason),
        timestamp: new Date().toISOString(),
      });
      // Keep only last 10 errors
      if (errors.length > 10) errors.shift();
      sessionStorage.setItem('app_errors', JSON.stringify(errors));
    } catch (e) {
      // Ignore sessionStorage errors
    }
  });

  // Catch uncaught errors
  window.addEventListener('error', (event) => {
    console.error('❌ Uncaught Error:', event.error);
    
    // Prevent the default behavior
    event.preventDefault();
    
    // Log details
    console.error('Error details:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    });
    
    // Store for debugging
    try {
      const errors = JSON.parse(sessionStorage.getItem('app_errors') || '[]');
      errors.push({
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString(),
      });
      if (errors.length > 10) errors.shift();
      sessionStorage.setItem('app_errors', JSON.stringify(errors));
    } catch (e) {
      // Ignore sessionStorage errors
    }
  });

  // Catch resource loading errors (images, scripts, etc.)
  window.addEventListener('error', (event) => {
    if (event.target && (event.target as any).tagName) {
      const target = event.target as HTMLElement;
      console.warn('⚠️ Resource failed to load:', {
        tag: target.tagName,
        src: (target as any).src || (target as any).href
      });
    }
  }, true); // Use capture phase

  // Log when page is hidden (mobile background)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('📱 App backgrounded');
    } else {
      console.log('📱 App foregrounded');
    }
  });

  // Detect low memory warnings on mobile
  if ('onmemorywarning' in window) {
    (window as any).addEventListener('memorywarning', () => {
      console.warn('⚠️ Low memory warning!');
      // Clear caches, unload unnecessary data
      try {
        // Clear old localStorage data
        const keysToKeep = ['applicationDraft', 'currentPaymentSession'];
        Object.keys(localStorage).forEach(key => {
          if (!keysToKeep.includes(key)) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.error('Failed to clear cache:', e);
      }
    });
  }

  isInitialized = true;
  console.log('✅ Mobile error handler initialized');
}

/**
 * Get logged errors for debugging
 */
export function getLoggedErrors(): any[] {
  try {
    return JSON.parse(sessionStorage.getItem('app_errors') || '[]');
  } catch {
    return [];
  }
}

/**
 * Clear logged errors
 */
export function clearLoggedErrors() {
  try {
    sessionStorage.removeItem('app_errors');
  } catch {
    // Ignore
  }
}

/**
 * Check if app is running on mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // Mobile detection
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
    userAgent.toLowerCase()
  );
}

/**
 * Get device info for debugging
 */
export function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      platform: 'server',
      userAgent: 'server'
    };
  }

  return {
    isMobile: isMobileDevice(),
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    language: navigator.language,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height
    }
  };
}
