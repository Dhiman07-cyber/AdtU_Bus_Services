/**
 * API Route: Create Razorpay Order
 * POST /api/payment/razorpay/create-order
 * 
 * SECURITY: Requires authentication, applies rate limiting
 * Creates a new payment order using Razorpay API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRazorpayOrder, generateReceiptId } from '@/lib/payment/razorpay.service';
import { adminAuth } from '@/lib/firebase-admin';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';
import { CreateOrderSchema, validateInput } from '@/lib/security/validation-schemas';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify authentication
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    let authenticatedUserId: string | null = null;

    if (token) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        authenticatedUserId = decodedToken.uid;
      } catch (authError) {
        console.warn('Auth token invalid, proceeding without auth');
      }
    }

    // Parse request body
    const body = await request.json();

    // SECURITY: Validate input with Zod schema
    const validation = validateInput(CreateOrderSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { amount, notes, userId, userName, purpose, enrollmentId, durationYears } = validation.data;

    // SECURITY: Rate limit by user ID or IP
    const rateLimitId = authenticatedUserId
      ? createRateLimitId(authenticatedUserId, 'payment-create')
      : `ip:${request.headers.get('x-forwarded-for') || 'unknown'}:payment-create`;

    const rateCheck = checkRateLimit(rateLimitId, RateLimits.PAYMENT_CREATE.maxRequests, RateLimits.PAYMENT_CREATE.windowMs);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many payment requests. Please wait before trying again.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateCheck.resetIn / 1000))
          }
        }
      );
    }

    // SECURITY: Use authenticated user ID for payment, not client-supplied one
    const trustedUserId = authenticatedUserId || userId;

    // Generate unique receipt ID
    const receipt = generateReceiptId('ADTU_BUS');

    // Create order notes - IMPORTANT: These are used by webhook/verification
    // SECURITY: Use trustedUserId (from auth) instead of client-supplied userId
    const orderNotes = {
      ...notes, // Spread custom notes first
      // Then override with trusted values
      userId: trustedUserId || 'unknown', // SECURITY: Use authenticated user ID
      enrollmentId: enrollmentId || notes?.enrollmentId || '',
      studentId: enrollmentId || notes?.enrollmentId || trustedUserId || '',
      studentName: userName || 'Unknown',
      userName: userName || 'Unknown',
      durationYears: durationYears?.toString() || notes?.duration?.toString() || '1',
      purpose: purpose || 'Bus Service Payment',
      type: purpose === 'renewal' ? 'renewal' : 'new_registration',
      timestamp: new Date().toISOString(),
    };

    // Create Razorpay order
    const order = await createRazorpayOrder(amount, receipt, orderNotes);

    // Log order creation for testing
    console.log('📝 Order created:', {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });

    // Return success response
    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        notes: order.notes,
      },
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });

  } catch (error: any) {
    console.error('❌ Error in create-order API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create payment order',
      },
      { status: 500 }
    );
  }
}

// OPTIONS method for CORS - Production safe
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || '';

  // SECURITY: Define allowed origins
  const allowedOrigins: string[] = [
    'https://adtu-bus.vercel.app',
    'https://adtu-bus-xq.vercel.app',
    process.env.NEXT_PUBLIC_APP_URL || '',
  ].filter(Boolean);

  // Check if origin is allowed (includes Vercel preview deployments)
  const isVercelPreview = /^https:\/\/.*\.vercel\.app$/.test(origin);
  const isLocalhost = process.env.NODE_ENV === 'development' &&
    (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000');
  const isAllowed = allowedOrigins.includes(origin) || isVercelPreview || isLocalhost;

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? origin : (allowedOrigins[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}
