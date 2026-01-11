/**
 * useRazorpay Hook
 * Custom React hook for handling Razorpay payments
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Types
export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
  };
  readonly?: {
    email?: boolean;
    contact?: boolean;
  };
  config?: {
    display?: {
      language?: string;
    };
  };
}

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface PaymentConfig {
  amount: number;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  enrollmentId?: string;
  durationYears?: number;
  purpose?: string;
  notes?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  signature?: string;
  error?: string;
  errorCode?: string;
  errorReason?: string;
  details?: any;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Custom hook for Razorpay payment integration
 */
export function useRazorpay() {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Razorpay script with mobile-specific handling and zombie script recovery
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let checkIntervalId: NodeJS.Timeout;

    const loadScript = () => {
      console.log('🔄 Loading new Razorpay script...');
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.crossOrigin = 'anonymous'; // Mobile compatibility

      script.onload = () => {
        console.log('✅ Razorpay script loaded successfully');
        setIsScriptLoaded(true);
        setError(null);
      };

      script.onerror = (e) => {
        console.error('❌ Failed to load Razorpay script:', e);
        setError('Failed to load payment gateway');
        toast.error('Payment gateway failed to load. Please check your connection and refresh.');
      };

      document.body.appendChild(script);

      // Timeout for the new script logic
      timeoutId = setTimeout(() => {
        if (!window.Razorpay) {
          console.error('❌ Razorpay script load timeout (new script)');
          setError('Payment gateway timeout');
          // Don't show toast immediately, user might still be on slow connection
        }
      }, 20000); // 20s timeout for new script
    };

    // Check if script is already fully loaded
    if (window.Razorpay) {
      console.log('✅ Razorpay already available on window');
      setIsScriptLoaded(true);
      return;
    }

    // Check for existing script tag (zombie check)
    const existingScript = document.querySelector('script[src*="checkout.razorpay.com"]');

    if (existingScript) {
      console.log('⏳ Found existing Razorpay script tag, checking status...');

      // Wait briefly to see if it's just finishing loading
      let attempts = 0;
      checkIntervalId = setInterval(() => {
        attempts++;
        if (window.Razorpay) {
          clearInterval(checkIntervalId);
          console.log('✅ Razorpay loaded from existing script');
          setIsScriptLoaded(true);
        } else if (attempts >= 20) { // ~2 seconds wait
          clearInterval(checkIntervalId);
          console.warn('⚠️ Existing script tag unresponsive, forcing reload...');
          existingScript.remove(); // Kill the zombie script
          loadScript(); // Load a fresh one
        }
      }, 100);
    } else {
      loadScript();
    }

    return () => {
      clearTimeout(timeoutId);
      clearInterval(checkIntervalId);
      // We purposefully don't remove the script on unmount to allow caching across navs
    };
  }, []);

  /**
   * Create a payment order
   */
  const createOrder = useCallback(async (config: PaymentConfig) => {
    try {
      const response = await fetch('/api/payment/razorpay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: config.amount,
          userId: config.userId || 'anonymous',
          userName: config.userName || 'Guest User',
          enrollmentId: config.enrollmentId,
          durationYears: config.durationYears || config.notes?.duration,
          purpose: config.purpose || 'Bus Service Payment',
          notes: {
            ...config.notes,
            email: config.userEmail || '',
            phone: config.userPhone || '',
            enrollmentId: config.enrollmentId || '',
            durationYears: String(config.durationYears || config.notes?.duration || '1'),
            // Ensure all note values are strings to satisfy Zod schema
            description: config.purpose || 'Bus Service Payment'
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create order');
      }

      return data;
    } catch (error: any) {
      console.error('❌ Error creating order:', error);
      throw error;
    }
  }, []);

  /**
   * Verify payment after successful transaction
   */
  const verifyPayment = useCallback(async (
    response: RazorpayResponse,
    config: PaymentConfig
  ): Promise<PaymentResult> => {
    console.log('🔄 Starting payment verification...');
    console.log('📦 Verification data:', {
      paymentId: response.razorpay_payment_id,
      orderId: response.razorpay_order_id,
      userId: config.userId,
      purpose: config.purpose,
      enrollmentId: config.enrollmentId,
      durationYears: config.durationYears
    });

    try {
      console.log('🚀 Calling /api/payment/razorpay/verify-payment...');

      const requestBody = {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
        userId: config.userId,
        userName: config.userName,
        enrollmentId: config.enrollmentId,
        durationYears: config.durationYears || config.notes?.duration,
        purpose: config.purpose,
        amount: config.amount,
      };

      console.log('📤 EXACT REQUEST BODY:', JSON.stringify(requestBody, null, 2));
      console.log('🔑 KEY VALUES:');
      console.log('   purpose:', requestBody.purpose, '(type:', typeof requestBody.purpose, ')');
      console.log('   userId:', requestBody.userId, '(type:', typeof requestBody.userId, ')');
      console.log('   durationYears:', requestBody.durationYears, '(type:', typeof requestBody.durationYears, ')');

      const verifyResponse = await fetch('/api/payment/razorpay/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('💬 API Response status:', verifyResponse.status);
      const data = await verifyResponse.json();
      console.log('📦 API Response data:', JSON.stringify(data, null, 2));
      console.log('🔍 Response details:');
      console.log('   - success:', data.success);
      console.log('   - message:', data.message);
      console.log('   - error:', data.error);

      if (data.success) {
        return {
          success: true,
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
          details: data.payment,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Payment verification failed',
        };
      }
    } catch (error: any) {
      console.error('❌ Payment verification error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return {
        success: false,
        error: error.message || 'Payment verification failed',
      };
    }
  }, []);

  /**
   * Process payment
   */
  const processPayment = useCallback(async (
    config: PaymentConfig
  ): Promise<PaymentResult> => {
    // Reset error state
    setError(null);

    // Validate script loaded
    if (!isScriptLoaded) {
      const errorMsg = 'Payment gateway not loaded. Please refresh the page.';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Validate amount
    if (!config.amount || config.amount <= 0) {
      const errorMsg = 'Invalid amount';
      setError(errorMsg);
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    setIsProcessing(true);

    try {
      // Step 1: Create order
      console.log('📝 Creating payment order...');
      toast.loading('Creating payment order...');

      const orderData = await createOrder(config);

      console.log('✅ Order created:', orderData.order.id);
      toast.dismiss();

      // Step 2: Open Razorpay checkout with mobile optimization
      return new Promise<PaymentResult>((resolve) => {
        // Verify Razorpay is available
        if (!window.Razorpay) {
          const errorMsg = 'Payment gateway not available. Please refresh the page.';
          setError(errorMsg);
          setIsProcessing(false);
          toast.dismiss();
          toast.error(errorMsg);
          resolve({ success: false, error: errorMsg });
          return;
        }

        const options: RazorpayOptions = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
          amount: orderData.order.amount,
          currency: orderData.order.currency,
          name: 'ADTU Bus Service',
          description: config.purpose || 'Bus Service Payment',
          order_id: orderData.order.id,
          prefill: {
            name: config.userName,
            email: config.userEmail,
            contact: config.userPhone,
          },
          theme: {
            color: '#3B82F6',
          },
          // Mobile-specific options
          readonly: {
            email: !!config.userEmail,
            contact: !!config.userPhone,
          },
          config: {
            display: {
              language: 'en',
            },
          },
          handler: async (response: RazorpayResponse) => {
            // Payment successful, verify it
            console.log('💳 Payment response received');
            toast.loading('Verifying payment...');

            const result = await verifyPayment(response, config);

            if (result.success) {
              toast.dismiss();
              toast.success('Payment completed successfully!');
            } else {
              toast.dismiss();
              toast.error(result.error || 'Payment verification failed');
            }

            setIsProcessing(false);
            resolve(result);
          },
          modal: {
            confirm_close: true,
            ondismiss: () => {
              console.log('⚠️ Payment cancelled by user');

              // Dismiss any loading toasts
              toast.dismiss();

              setIsProcessing(false);
              toast.warning('Payment cancelled. You can try again anytime.', { duration: 4000 });

              resolve({
                success: false,
                error: 'Payment cancelled by user',
                errorCode: 'USER_CANCELLED'
              });
            },
          },
        };

        // Create Razorpay instance with error handling
        let razorpay;
        try {
          razorpay = new window.Razorpay(options);
        } catch (err: any) {
          console.error('❌ Failed to create Razorpay instance:', err);
          const errorMsg = 'Failed to initialize payment gateway. Please try again.';
          setError(errorMsg);
          setIsProcessing(false);
          toast.dismiss();
          toast.error(errorMsg);
          resolve({ success: false, error: errorMsg });
          return;
        }

        // Handle payment failures
        razorpay.on('payment.failed', (response: any) => {
          console.error('❌ Payment failed:', response.error);

          // Dismiss any loading toasts first
          toast.dismiss();

          // Get user-friendly error message based on error code
          let errorMsg = 'Payment failed. Please try again.';

          if (response.error) {
            const errorCode = response.error.code;
            const errorReason = response.error.reason;

            // Handle specific error cases
            if (errorReason === 'payment_cancelled') {
              errorMsg = 'Payment was cancelled. You can try again when ready.';
            } else if (errorCode === 'BAD_REQUEST_ERROR') {
              errorMsg = response.error.description || 'Invalid payment request. Please try again.';
            } else if (errorCode === 'GATEWAY_ERROR') {
              errorMsg = 'Payment gateway error. Please try again after some time.';
            } else if (errorCode === 'NETWORK_ERROR') {
              errorMsg = 'Network error. Please check your connection and try again.';
            } else if (errorCode === 'SERVER_ERROR') {
              errorMsg = 'Server error. Please try again after some time.';
            } else if (response.error.description) {
              errorMsg = response.error.description;
            }
          }

          setError(errorMsg);
          setIsProcessing(false);
          toast.error(errorMsg, { duration: 5000 });

          resolve({
            success: false,
            error: errorMsg,
            errorCode: response.error?.code,
            errorReason: response.error?.reason
          });
        });

        // Open checkout with error handling
        try {
          razorpay.open();
        } catch (err: any) {
          console.error('❌ Failed to open Razorpay checkout:', err);
          const errorMsg = err.message || 'Failed to open payment checkout. Please try again.';
          setError(errorMsg);
          setIsProcessing(false);
          toast.dismiss();
          toast.error(errorMsg);
          resolve({ success: false, error: errorMsg });
        }
      });

    } catch (error: any) {
      console.error('❌ Payment process error:', error);
      const errorMsg = error.message || 'Failed to process payment';
      setError(errorMsg);
      setIsProcessing(false);
      toast.dismiss();
      toast.error(errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }
  }, [isScriptLoaded, createOrder, verifyPayment]);

  return {
    isScriptLoaded,
    isProcessing,
    error,
    processPayment,
    createOrder,
    verifyPayment,
  };
}
