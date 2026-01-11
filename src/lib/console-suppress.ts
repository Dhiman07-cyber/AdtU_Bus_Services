// Utility to suppress specific console warnings in development
export const suppressConsoleWarnings = () => {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const originalWarn = console.warn;
    console.warn = function (...args) {
      // Suppress the Next.js 15 params warning
      if (
        typeof args[0] === 'string' &&
        (args[0].includes('A param property was accessed directly with `params.id`') ||
         args[0].includes('Cannot assign to read only property \'params\' of object'))
      ) {
        // Don't log this specific warning
        return;
      }
      // For all other warnings, call the original console.warn
      originalWarn.apply(console, args);
    };
    
    // Also suppress the error
    const originalError = console.error;
    console.error = function (...args) {
      // Suppress the params error - check both string and object formats
      const errorMessage = typeof args[0] === 'string' ? args[0] : 
                          (args[0]?.message || args[0]?.toString() || '');
      
      if (
        errorMessage.includes('Cannot assign to read only property \'params\' of object') ||
        errorMessage.includes('A param property was accessed directly with `params.id`') ||
        errorMessage.includes('experiments.js') || // Suppress Firebase experiments.js error
        errorMessage.includes('ERR_ABORTED') // Suppress aborted network requests
      ) {
        // Don't log this specific error
        return;
      }
      // For all other errors, call the original console.error
      originalError.apply(console, args);
    };

    // Suppress unhandled promise rejections related to params
    const originalUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = function(event) {
      if (event.reason && typeof event.reason === 'object') {
        const errorMessage = event.reason.message || event.reason.toString() || '';
        if (errorMessage.includes('Cannot assign to read only property \'params\' of object')) {
          event.preventDefault();
          return;
        }
      }
      if (originalUnhandledRejection) {
        originalUnhandledRejection.call(window, event);
      }
    };
  }
};