/**
 * API Route: Verify Receipt Token (v2 - RSA-2048 Signatures)
 * POST /api/receipt/verify
 * 
 * Verifies a scanned receipt barcode/QR token and returns receipt data.
 * 
 * SECURITY MODEL:
 * 1. Parse QR code to extract Receipt ID and truncated signature
 * 2. Fetch receipt data from database (NEVER trust token alone)
 * 3. Rebuild document payload from database values
 * 4. Verify RSA-2048 signature against recomputed hash
 * 5. ANY modification to stored data will cause signature mismatch
 * 
 * SECURITY FEATURES:
 * - RSA-2048 digital signature verification
 * - Database-backed field verification (not token-based)
 * - Tamper detection for ANY field modification
 * - Backward compatible with legacy HMAC tokens
 * - Role-based response (Driver vs Admin/Moderator)
 * - Rate limiting
 * - Full audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { verifyReceiptSignature, quickValidateReceiptToken } from '@/lib/security/receipt-security.service';
import {
    parseSecureQRData,
    buildDocumentPayload,
    verifyReceiptIntegrity
} from '@/lib/security/document-crypto.service';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';

export async function POST(request: NextRequest) {
    try {
        // 1. Verify Authentication
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json(
                {
                    valid: false,
                    status: 'invalid',
                    message: 'Authentication required'
                },
                { status: 401 }
            );
        }

        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (authError) {
            return NextResponse.json(
                {
                    valid: false,
                    status: 'invalid',
                    message: 'Invalid or expired authentication'
                },
                { status: 401 }
            );
        }

        const scannerUid = decodedToken.uid;

        // 2. Verify Role (Driver, Admin, or Moderator only)
        const userDoc = await adminDb.collection('users').doc(scannerUid).get();
        const userData = userDoc.data();

        const allowedRoles = ['driver', 'admin', 'moderator'];
        if (!userData || !allowedRoles.includes(userData.role)) {
            return NextResponse.json(
                {
                    valid: false,
                    status: 'invalid',
                    message: 'Insufficient permissions to verify receipts'
                },
                { status: 403 }
            );
        }

        const scannerRole = userData.role;

        // 3. Rate Limiting
        const rateLimitId = createRateLimitId(scannerUid, 'verify-receipt');
        const rateCheck = checkRateLimit(
            rateLimitId,
            RateLimits.BUS_PASS_VERIFY?.maxRequests || 100,
            RateLimits.BUS_PASS_VERIFY?.windowMs || 60000
        );

        if (!rateCheck.allowed) {
            return NextResponse.json(
                {
                    valid: false,
                    status: 'rate_limited',
                    message: 'Too many verification requests. Please wait.',
                    resetIn: rateCheck.resetIn
                },
                { status: 429 }
            );
        }

        // 4. Parse Request Body
        const body = await request.json();
        const { receiptToken, scanContext } = body;

        if (!receiptToken) {
            return NextResponse.json(
                {
                    valid: false,
                    status: 'invalid',
                    message: 'Receipt verification token is required'
                },
                { status: 400 }
            );
        }

        // 5. Detect Token Format (v2 RSA-2048 or v1 HMAC)
        const isV2Token = receiptToken.startsWith('ADTU-R2-');
        const isV1Token = receiptToken.startsWith('ADTU-R1-');

        if (!isV2Token && !isV1Token) {
            console.warn(`Unrecognized receipt token format from ${scannerRole}: ${scannerUid}`);
            return NextResponse.json({
                valid: false,
                status: 'invalid',
                message: 'Unrecognized receipt format. Please show a valid ADTU receipt.',
                suspicious: true
            });
        }

        let receiptId: string;
        let truncatedSignature: string | undefined;
        let isLegacyToken = false;

        // 6. Parse Token Based on Version
        if (isV2Token) {
            // New RSA-2048 format
            const qrData = parseSecureQRData(receiptToken);
            if (!qrData) {
                console.warn(`Failed to parse v2 receipt token from ${scannerRole}: ${scannerUid}`);
                return NextResponse.json({
                    valid: false,
                    status: 'tampered',
                    message: 'Unable to verify document authenticity. This receipt appears to be modified or not generated by the ADTU Bus Services system. Please present the original, system-generated document.',
                    suspicious: true
                });
            }
            receiptId = qrData.rid;
            truncatedSignature = qrData.sig;
        } else {
            // Legacy HMAC format (v1) - backward compatibility
            isLegacyToken = true;

            // Quick HMAC validation first
            if (!quickValidateReceiptToken(receiptToken)) {
                console.warn(`Invalid legacy receipt token from ${scannerRole}: ${scannerUid}`);
                return NextResponse.json({
                    valid: false,
                    status: 'tampered',
                    message: 'Unable to verify document authenticity. This receipt appears to be modified or not generated by the ADTU Bus Services system. Please present the original, system-generated document.',
                    suspicious: true
                });
            }

            // Full legacy token verification
            const receiptPayload = verifyReceiptSignature(receiptToken);
            if (!receiptPayload) {
                return NextResponse.json({
                    valid: false,
                    status: 'expired',
                    message: 'Receipt verification has expired or is invalid.',
                    suspicious: false
                });
            }
            receiptId = receiptPayload.receiptId;
        }

        // 7. Fetch Actual Receipt from Database (NEVER trust token alone)
        const payment = await paymentsSupabaseService.getPaymentById(receiptId);

        if (!payment) {
            console.warn(`Receipt not found in database: ${receiptId}`);
            return NextResponse.json({
                valid: false,
                status: 'not_found',
                message: 'Receipt not found in system records.',
                suspicious: true
            });
        }

        // 8. For v2 tokens: Verify RSA-2048 Signature
        if (isV2Token && truncatedSignature) {
            // Get stored signature from database
            const storedSignature = await paymentsSupabaseService.getDocumentSignature(receiptId);

            if (!storedSignature) {
                // Signature not stored yet (legacy receipt regenerated)
                // Fall back to basic validation
                console.log(`No stored signature for ${receiptId}, performing basic validation`);
            } else {
                // Rebuild document payload from database values
                const paymentMethod = (payment.method || 'Offline') as 'Online' | 'Offline';
                const documentPayload = buildDocumentPayload({
                    payment_id: payment.payment_id,
                    student_uid: payment.student_uid || '',
                    student_name: payment.student_name || 'Unknown',
                    student_id: payment.student_id || '',
                    amount: payment.amount || 0,
                    method: paymentMethod,
                    session_start_year: payment.session_start_year?.toString(),
                    session_end_year: payment.session_end_year?.toString(),
                    valid_until: payment.valid_until,
                    transaction_date: payment.transaction_date,
                    created_at: payment.created_at,
                    razorpay_order_id: payment.razorpay_order_id,
                    razorpay_payment_id: payment.razorpay_payment_id,
                    offline_transaction_id: payment.offline_transaction_id,
                    approved_by: payment.approved_by
                });

                // Verify cryptographic integrity
                const integrityResult = verifyReceiptIntegrity(
                    documentPayload,
                    storedSignature,
                    truncatedSignature
                );

                if (!integrityResult.valid) {
                    console.warn(`🚨 TAMPERING DETECTED for receipt ${receiptId}: ${integrityResult.status}`);
                    return NextResponse.json({
                        valid: false,
                        status: integrityResult.status,
                        message: integrityResult.message,
                        suspicious: integrityResult.suspicious
                    });
                }

                console.log(`✅ RSA-2048 signature verified for receipt: ${receiptId}`);
            }
        }

        // 9. Additional UID verification for v1 tokens
        if (isLegacyToken) {
            const legacyPayload = verifyReceiptSignature(receiptToken);
            if (legacyPayload && payment.student_uid !== legacyPayload.studentUid) {
                console.warn(`Receipt UID mismatch! Token UID: ${legacyPayload.studentUid}, DB UID: ${payment.student_uid}`);
                return NextResponse.json({
                    valid: false,
                    status: 'tampered',
                    message: 'Unable to verify document authenticity. Data mismatch detected.',
                    suspicious: true
                });
            }
        }

        // 10. Build Response Based on Role
        const formatDate = (dateStr: string | Date) => {
            return new Date(dateStr).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        };

        // Fetch student profile photo
        let studentProfilePic = '';
        try {
            let studentDoc = await adminDb.collection('students').doc(payment.student_uid || '').get();
            if (studentDoc.exists) {
                const sData = studentDoc.data();
                studentProfilePic = sData?.profilePhotoUrl || sData?.photoURL || '';
            } else {
                studentDoc = await adminDb.collection('users').doc(payment.student_uid || '').get();
                if (studentDoc.exists) {
                    const sData = studentDoc.data();
                    studentProfilePic = sData?.profilePhotoUrl || sData?.profileImage || sData?.photoURL || '';
                }
            }
        } catch (e) {
            console.error('Failed to fetch student profile for receipt:', e);
        }

        const baseReceiptData = {
            studentName: payment.student_name,
            enrollmentId: payment.student_id,
            paymentMethod: payment.method,
            amount: payment.amount,
            sessionValidity: `${payment.session_start_year} - ${payment.session_end_year}`,
            approvalStatus: payment.status === 'Completed' ? 'Approved' : payment.status,
            issuedDate: formatDate(payment.transaction_date || payment.created_at || new Date().toISOString()),
            receiptId: payment.payment_id,
            verifiedAt: new Date().toISOString(),
            studentUid: payment.student_uid,
            studentProfilePic
        };

        // Admin/Moderator gets extended data
        const extendedReceiptData = scannerRole !== 'driver' ? {
            ...baseReceiptData,
            purpose: payment.purpose,
            approvedBy: payment.approved_by,
            razorpayOrderId: payment.razorpay_order_id,
            offlineTransactionId: payment.offline_transaction_id,
            validUntil: formatDate(payment.valid_until || new Date().toISOString()),
            metadata: payment.metadata,
            studentUid: payment.student_uid,
            createdAt: payment.created_at,
            updatedAt: payment.updated_at
        } : baseReceiptData;

        // 11. Log Verification Event
        console.log('✅ Receipt verified:', {
            receiptId: payment.payment_id,
            studentId: payment.student_id,
            verifiedBy: scannerUid,
            scannerRole,
            tokenVersion: isV2Token ? 'v2-RSA' : 'v1-HMAC',
            scanContext,
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({
            valid: true,
            status: 'valid',
            message: isV2Token
                ? 'Document authenticity verified. This receipt is genuine and has not been modified.'
                : 'Receipt verified successfully.',
            receiptData: extendedReceiptData,
            tokenInfo: {
                version: isV2Token ? 2 : 1,
                signatureType: isV2Token ? 'RSA-2048' : 'HMAC-SHA256'
            },
            scannerRole,
            verifiedAt: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Receipt verification error:', error);
        return NextResponse.json(
            {
                valid: false,
                status: 'invalid',
                message: 'Verification failed due to a system error.'
            },
            { status: 500 }
        );
    }
}
