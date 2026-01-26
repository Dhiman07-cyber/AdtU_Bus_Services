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
    const loadScript = () => {
      // Check if already in document
      if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
        console.log('⏳ Razorpay script already present in DOM');
        return;
      }

      console.log('🔄 Loading Razorpay script...');
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;

      script.onload = () => {
        console.log('✅ Razorpay script loaded');
        setIsScriptLoaded(true);
      };

      script.onerror = () => {
        console.error('❌ Razorpay script failed');
        setError('Failed to load payment gateway');
      };

      document.body.appendChild(script);
    };

    if (window.Razorpay) {
      setIsScriptLoaded(true);
    } else {
      loadScript();
    }
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

        // --- MOBILE BACK BUTTON PROTECTION ---
        // Set up history state and handlers BEFORE creating Razorpay instance
        const historyState = { isRazorpayOpen: true, orderId: orderData.order.id };
        let historyCleanedUp = false;

        const cleanupHistory = () => {
          if (historyCleanedUp) return;
          historyCleanedUp = true;
          window.removeEventListener("popstate", handlePopState);
          // If we're still on the state we pushed, go back to clean it up
          if (window.history.state?.isRazorpayOpen && window.history.state?.orderId === orderData.order.id) {
            window.history.back();
          }
        };

        const handlePopState = (event: PopStateEvent) => {
          console.log("🔙 System back button detected while Razorpay open");
          cleanupHistory();
        };
        // --------------------------------------

        // Wrap the success handler to include history cleanup BEFORE creating Razorpay instance
        const originalHandler = options.handler;
        options.handler = async (response: RazorpayResponse) => {
          console.log('💳 Payment handler triggered with response:', response);
          cleanupHistory();
          await originalHandler(response);
        };

        // Wrap ondismiss to include history cleanup BEFORE creating Razorpay instance
        const originalOnDismiss = options.modal?.ondismiss;
        if (options.modal) {
          options.modal.ondismiss = () => {
            cleanupHistory();
            if (originalOnDismiss) originalOnDismiss();
          };
        }

        // Create Razorpay instance with error handling (now with wrapped handlers)
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
          console.error('❌ Payment failed response:', response);
          cleanupHistory();

          // Dismiss any loading toasts first
          toast.dismiss();

          // Get user-friendly error message based on error code
          let errorMsg = 'Payment failed. Please try again.';
          let errorDesc = 'The transaction was declined by the bank.';

          if (response.error) {
            const errorMetadata = response.error.metadata || {};
            const paymentId = errorMetadata.payment_id || response.error.payment_id;

            // Log full details for debugging
            console.error('❌ Razorpay Error Details:', {
              code: response.error.code,
              description: response.error.description,
              source: response.error.source,
              step: response.error.step,
              reason: response.error.reason,
              metadata: response.error.metadata
            });

            if (response.error.description) {
              errorMsg = response.error.description;
            } else if (response.error.reason) {
              // Fallback for when description is missing but reason exists
              errorMsg = `Payment failed: ${response.error.reason.replace(/_/g, ' ')}`;
            }

            // Refine description based on reason
            if (response.error.reason === 'payment_cancelled') {
              errorDesc = 'You cancelled the payment process.';
            } else if (response.error.reason === 'payment_failed') {
              errorDesc = 'Your card or bank declined the transaction.';
            } else if (response.error.source === 'customer') {
              errorDesc = 'There was an issue with the customer details or authentication.';
            }
          }

          setError(errorMsg);
          setIsProcessing(false);

          // Use red background as requested
          toast.error(errorMsg, {
            description: errorDesc,
            duration: 6000,
            style: {
              backgroundColor: '#FEF2F2', // Red-50
              border: '1px solid #F87171', // Red-400
              color: '#991B1B', // Red-800
            },
            className: 'error-toast', // fallback if style doesn't fully apply depending on sonner config
          });

          resolve({
            success: false,
            error: errorMsg,
            errorCode: response.error?.code,
            errorReason: response.error?.reason
          });
        });

        // Open checkout with error handling
        try {
          // Push history state for back button protection
          window.history.pushState(historyState, "");
          window.addEventListener("popstate", handlePopState);

          razorpay.open();
        } catch (err: any) {
          console.error('❌ Failed to open Razorpay checkout:', err);
          cleanupHistory();
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
