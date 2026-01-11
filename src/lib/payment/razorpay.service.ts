/**
 * Razorpay Payment Service
 * Handles all Razorpay payment operations including order creation and verification
 */

import crypto from 'crypto';

// Razorpay Types
export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: any;
  created_at: number;
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface PaymentVerification {
  isValid: boolean;
  orderId?: string;
  paymentId?: string;
  signature?: string;
  error?: string;
}

// Initialize Razorpay with dynamic import to avoid client-side issues
let razorpayInstance: any = null;

/**
 * Initialize Razorpay instance (server-side only)
 */
async function initializeRazorpay() {
  if (!razorpayInstance) {
    const Razorpay = (await import('razorpay')).default;
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });
  }
  return razorpayInstance;
}

/**
 * Create a new Razorpay order
 * @param amount - Amount in rupees (will be converted to paise)
 * @param receipt - Unique receipt ID for the order
 * @param notes - Additional notes for the order
 */
export async function createRazorpayOrder(
  amount: number,
  receipt: string,
  notes?: Record<string, any>
): Promise<RazorpayOrder> {
  try {
    const razorpay = await initializeRazorpay();
    
    // Validate amount
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount. Amount must be greater than 0');
    }

    // Create order options
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    };

    // Create order using Razorpay API
    const order = await razorpay.orders.create(options);
    
    console.log('✅ Razorpay order created:', order.id);
    return order;
  } catch (error: any) {
    console.error('❌ Error creating Razorpay order:', error);
    throw new Error(error.message || 'Failed to create payment order');
  }
}

/**
 * Verify Razorpay payment signature using HMAC SHA256
 * @param paymentResponse - Response from Razorpay after payment
 * @param secret - Razorpay secret key
 */
export function verifyRazorpaySignature(
  paymentResponse: RazorpayPaymentResponse
): PaymentVerification {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentResponse;
    
    // Validate input
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return {
        isValid: false,
        error: 'Missing payment details',
      };
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new Error('Razorpay secret key not configured');
    }

    // Create the signature using HMAC SHA256
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    // Compare signatures
    const isValid = expectedSignature === razorpay_signature;

    if (isValid) {
      console.log('✅ Payment signature verified successfully');
      return {
        isValid: true,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      };
    } else {
      console.error('❌ Payment signature verification failed');
      return {
        isValid: false,
        error: 'Invalid payment signature',
      };
    }
  } catch (error: any) {
    console.error('❌ Error verifying payment:', error);
    return {
      isValid: false,
      error: error.message || 'Payment verification failed',
    };
  }
}

/**
 * Fetch payment details from Razorpay
 * @param paymentId - Razorpay payment ID
 */
export async function fetchPaymentDetails(paymentId: string) {
  try {
    const razorpay = await initializeRazorpay();
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error: any) {
    console.error('❌ Error fetching payment details:', error);
    throw new Error('Failed to fetch payment details');
  }
}

/**
 * Fetch order details from Razorpay
 * @param orderId - Razorpay order ID
 */
export async function fetchOrderDetails(orderId: string) {
  try {
    const razorpay = await initializeRazorpay();
    const order = await razorpay.orders.fetch(orderId);
    return order;
  } catch (error: any) {
    console.error('❌ Error fetching order details:', error);
    throw new Error('Failed to fetch order details');
  }
}

/**
 * Generate a unique receipt ID
 */
export function generateReceiptId(prefix: string = 'ADTU'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Format amount for display
 * @param amountInPaise - Amount in paise
 */
export function formatAmount(amountInPaise: number): string {
  const amountInRupees = amountInPaise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amountInRupees);
}
