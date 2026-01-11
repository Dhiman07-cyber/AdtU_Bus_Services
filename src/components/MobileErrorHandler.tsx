"use client";

import { useEffect } from 'react';
import { initMobileErrorHandler } from '@/lib/utils/mobile-error-handler';

/**
 * Mobile Error Handler Component
 * Initializes global error handling for mobile devices
 */
export default function MobileErrorHandler() {
  useEffect(() => {
    // Initialize error handler only on client side
    initMobileErrorHandler();
  }, []);

  // This component doesn't render anything
  return null;
}
