/**
 * useRazorpay Hook
 * Custom React hook for handling Razorpay payments
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

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
  const { currentUser } = useAuth();
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Razorpay script with mobile-specific handling and zombie script recovery
  useEffect(() => {
    const loadScript = () => {
      // Check if already in document
      if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
        return;
      }


      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;

      script.onload = () => {
        setIsScriptLoaded(true);
      };

      script.onerror = () => {
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
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/payment/razorpay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
      throw error;
    }
  }, [currentUser]);

  /**
   * Verify payment after successful transaction
   */
  const verifyPayment = useCallback(async (
    response: RazorpayResponse,
    config: PaymentConfig
  ): Promise<PaymentResult> => {


    try {

      const token = await currentUser?.getIdToken();

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



      const verifyResponse = await fetch('/api/payment/razorpay/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody),
      });

      const data = await verifyResponse.json();

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
      return {
        success: false,
        error: error.message || 'Payment verification failed',
      };
    }
  }, [currentUser]);

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
      toast.loading('Creating payment order...');

      const orderData = await createOrder(config);

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
            toast.loading('Verifying payment...');

            const result = await verifyPayment(response, config);

            toast.dismiss();
            if (result.success) {
              toast.success('Payment completed successfully!');
            } else {
              toast.error(result.error || 'Payment verification failed');
            }

            setIsProcessing(false);
            resolve(result);
          },
          modal: {
            confirm_close: true,
            ondismiss: () => {
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

          cleanupHistory();
        };
        // --------------------------------------

        // Wrap the success handler to include history cleanup BEFORE creating Razorpay instance
        const originalHandler = options.handler;
        options.handler = async (response: RazorpayResponse) => {
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

          cleanupHistory();

          toast.dismiss();

          // Get user-friendly error message based on error code
          let errorMsg = 'Payment failed. Please try again.';
          let errorDesc = 'The transaction was declined by the bank.';

          if (response.error) {


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
