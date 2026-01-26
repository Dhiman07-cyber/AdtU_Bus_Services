/**
 * API Route: Verify Razorpay Payment
 * POST /api/payment/razorpay/verify-payment
 * 
 * SECURITY: Verifies payment signature AND extracts trusted data from Razorpay order notes
 * Does NOT trust client-supplied userId, enrollmentId, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRazorpaySignature,
  fetchPaymentDetails,
  fetchOrderDetails,
  RazorpayPaymentResponse
} from '@/lib/payment/razorpay.service';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { createOnlinePayment } from '@/lib/payment/payment.service';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';
import { computeBlockDatesForStudent } from '@/lib/utils/deadline-computation';

export async function POST(request: NextRequest) {
  console.log('🎯 VERIFY-PAYMENT ENDPOINT HIT!');

  try {
    // Parse request body
    const body = await request.json();
    console.log('📦 Request body received (signature data only)');

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      // NOTE: We accept these from client for LOGGING only
      // Trusted values are extracted from Razorpay order notes
      userId: clientUserId,
      purpose: clientPurpose,
    } = body;

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing payment details',
        },
        { status: 400 }
      );
    }

    // Create payment response object
    const paymentResponse: RazorpayPaymentResponse = {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    };

    // Verify payment signature
    const verification = verifyRazorpaySignature(paymentResponse);

    if (!verification.isValid) {
      console.error('❌ Payment verification failed:', verification.error);
      return NextResponse.json(
        {
          success: false,
          error: verification.error || 'Payment verification failed',
        },
        { status: 400 }
      );
    }

    // SECURITY: Fetch order details from Razorpay to get TRUSTED data
    // This is the authoritative source - NOT client-supplied values
    let orderDetails;
    try {
      orderDetails = await fetchOrderDetails(razorpay_order_id);
      console.log('📋 Order details fetched from Razorpay');
    } catch (error) {
      console.error('❌ Failed to fetch order details:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to verify order details' },
        { status: 500 }
      );
    }

    // SECURITY: Extract TRUSTED values from order notes (set during order creation)
    const trustedNotes = orderDetails.notes || {};
    const trustedUserId = trustedNotes.userId;
    const trustedEnrollmentId = trustedNotes.enrollmentId || trustedNotes.studentId;
    const trustedStudentName = trustedNotes.studentName || trustedNotes.userName || 'Unknown';
    const trustedDurationYears = parseInt(trustedNotes.durationYears || '1');
    const trustedPurpose = trustedNotes.purpose || trustedNotes.type || 'renewal';
    const trustedAmount = orderDetails.amount / 100; // Razorpay stores in paise

    console.log('🔒 TRUSTED values from Razorpay order:', {
      userId: trustedUserId,
      enrollmentId: trustedEnrollmentId,
      amount: trustedAmount,
      purpose: trustedPurpose
    });

    // SECURITY: Log if client values don't match (potential attack detection)
    if (clientUserId && clientUserId !== trustedUserId) {
      console.warn(`⚠️ SECURITY: Client userId "${clientUserId}" doesn't match order userId "${trustedUserId}"`);
    }

    // Fetch payment details from Razorpay
    let paymentDetails = null;
    try {
      paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
      console.log('💳 Payment details fetched:', {
        id: paymentDetails.id,
        amount: paymentDetails.amount,
        status: paymentDetails.status,
        method: paymentDetails.method,
      });
    } catch (error) {
      console.error('⚠️ Could not fetch payment details:', error);
      // Continue - signature already verified
    }

    // Create payment record for response
    const paymentRecord = {
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      signature: razorpay_signature,
      userId: trustedUserId,
      userName: trustedStudentName,
      purpose: trustedPurpose,
      amount: trustedAmount,
      status: paymentDetails?.status || 'captured',
      method: paymentDetails?.method || 'unknown',
      capturedAt: new Date().toISOString(),
    };

    // Apply rate limiting using trusted userId
    if (trustedUserId) {
      const rateLimitId = createRateLimitId(trustedUserId, 'payment-verify');
      const rateCheck = checkRateLimit(rateLimitId, RateLimits.PAYMENT_VERIFY.maxRequests, RateLimits.PAYMENT_VERIFY.windowMs);
      if (!rateCheck.allowed) {
        console.warn(`⚠️ Rate limit exceeded for payment verification: ${trustedUserId}`);
        return NextResponse.json(
          { success: false, error: 'Too many verification requests. Please wait.' },
          { status: 429 }
        );
      }
    }

    console.log('✅ Payment verified successfully:', {
      paymentId: paymentRecord.paymentId,
      orderId: paymentRecord.orderId,
      amount: paymentRecord.amount,
    });

    // Check if this is a renewal or registration payment
    const isNewRegistration = trustedPurpose?.toLowerCase()?.includes('registration') ||
      trustedPurpose === 'new_registration';
    const isRenewal = trustedPurpose?.toLowerCase()?.includes('renewal') ||
      trustedPurpose === 'renewal';

    console.log('🔍 Payment type:', { isNewRegistration, isRenewal, trustedPurpose });

    // Process payment if we have a trusted userId
    if (trustedUserId && (isRenewal || isNewRegistration)) {
      console.log('✅ Processing payment for user:', trustedUserId);

      try {
        // Check idempotency - prevent duplicate processing
        const isProcessed = await PaymentTransactionService.isPaymentProcessed(razorpay_payment_id);
        if (isProcessed) {
          console.log(`Payment ${razorpay_payment_id} already processed`);
          return NextResponse.json({
            success: true,
            message: 'Payment already processed',
            payment: paymentRecord,
          });
        }

        let transactionRecord: any = null;

        if (isNewRegistration) {
          console.log('📝 New registration payment - saving transaction only');

          transactionRecord = {
            studentId: trustedEnrollmentId,
            studentName: trustedStudentName,
            amount: trustedAmount,
            paymentMethod: 'online' as const,
            paymentId: razorpay_payment_id,
            timestamp: new Date().toISOString(),
            durationYears: trustedDurationYears,
            validUntil: '',
            status: 'completed' as const,
            purpose: 'new_registration'
          };

        } else {
          // RENEWAL: Update student document in Firestore
          console.log('🔄 Renewal payment - updating student document');
          const studentRef = adminDb.collection('students').doc(trustedUserId);

          await adminDb.runTransaction(async (transaction: any) => {
            const studentDoc = await transaction.get(studentRef);

            if (!studentDoc.exists) {
              throw new Error('Student document not found');
            }

            const studentData = studentDoc.data();
            const actualStudentName = studentData?.fullName || trustedStudentName;
            const actualEnrollmentId = studentData?.enrollmentId || trustedEnrollmentId;

            // Get existing values
            const existingSessionStartYear = studentData?.sessionStartYear || new Date().getFullYear();
            const existingDurationYears = studentData?.durationYears || 0;
            const existingValidUntil = studentData?.validUntil;

            // Calculate new validity from existing or current date
            let baseYear = new Date().getFullYear();
            if (existingValidUntil) {
              const existingDate = existingValidUntil.toDate ? existingValidUntil.toDate() : new Date(existingValidUntil);
              if (existingDate > new Date()) {
                baseYear = existingDate.getFullYear();
              }
            }

            // Calculate new validity date
            const newValidUntil = calculateValidUntilDate(baseYear, trustedDurationYears);
            const newSessionEndYear = newValidUntil.getFullYear();
            const totalDurationYears = existingDurationYears + trustedDurationYears;

            console.log('📝 Updating student document with:', {
              validUntil: newValidUntil.toISOString(),
              sessionEndYear: newSessionEndYear,
              totalDurationYears,
              paymentAmount: trustedAmount
            });

            // Compute block dates for the new sessionEndYear
            const blockDates = computeBlockDatesForStudent(newSessionEndYear);

            transaction.update(studentRef, {
              validUntil: newValidUntil,
              status: 'active',
              sessionStartYear: existingSessionStartYear,
              sessionEndYear: newSessionEndYear,
              paymentAmount: trustedAmount,
              lastRenewalDate: FieldValue.serverTimestamp(),
              durationYears: totalDurationYears,
              // Update block dates to align with new sessionEndYear
              softBlock: blockDates.softBlock,
              hardBlock: blockDates.hardBlock,
              updatedAt: FieldValue.serverTimestamp()
            });

            transactionRecord = {
              studentId: actualEnrollmentId,
              studentName: actualStudentName,
              amount: trustedAmount,
              paymentMethod: 'online' as const,
              paymentId: razorpay_payment_id,
              timestamp: new Date().toISOString(),
              durationYears: trustedDurationYears,
              validUntil: newValidUntil.toISOString(),
              status: 'completed' as const,
              purpose: 'renewal'
            };
          });

          console.log('✅ FIRESTORE UPDATE SUCCESSFUL!');
        }

        // Save to unified /payments collection (new system)
        if (transactionRecord) {
          try {
            await createOnlinePayment({
              studentUid: trustedUserId,
              studentId: transactionRecord.studentId,
              studentName: transactionRecord.studentName,
              amount: transactionRecord.amount,
              durationYears: transactionRecord.durationYears,
              sessionStartYear: new Date().getFullYear(),
              sessionEndYear: parseInt(transactionRecord.validUntil?.substring(0, 4) || String(new Date().getFullYear() + transactionRecord.durationYears)),
              validUntil: transactionRecord.validUntil || new Date().toISOString(),
              razorpayPaymentId: razorpay_payment_id,
              razorpayOrderId: razorpay_order_id,
              razorpaySignature: razorpay_signature,
              purpose: transactionRecord.purpose
            });
            console.log('✅ Payment saved to unified /payments collection!');
          } catch (paymentError) {
            console.error('⚠️ Failed to save to /payments collection:', paymentError);
          }
        }

      } catch (error) {
        console.error('Error updating student document:', error);
        console.log('⚠️ Payment verified but student update failed - needs manual reconciliation');
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      payment: paymentRecord,
      verification: {
        isValid: true,
        orderId: verification.orderId,
        paymentId: verification.paymentId,
      },
    });

  } catch (error: any) {
    console.error('❌ Error in verify-payment API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Payment verification failed',
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
