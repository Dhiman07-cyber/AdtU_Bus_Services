// Simple Analytics tracking component
// For Google Analytics event tracking

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

export function trackEvent(eventName: string, parameters?: Record<string, any>) {
  // Only track in production or when GA is available
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, parameters);
  } else {
    // Fallback to console logging in development
    console.log('Analytics Event:', eventName, parameters);
  }
}

export default function Analytics() {
  // This component can be used for any future analytics setup
  return null;
}
