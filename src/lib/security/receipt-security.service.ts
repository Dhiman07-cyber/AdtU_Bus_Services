/**
 * Receipt Security Service for ADTU Bus Services
 * 
 * Provides cryptographic security for payment receipts:
 * - Generates verifiable receipt signatures
 * - Creates scannable QR/barcodes with cryptographic proof
 * - Validates receipt authenticity server-side
 * - Invisible watermarking for forensic tracing
 * 
 * SECURITY FEATURES:
 * - HMAC-SHA256 signatures for integrity
 * - Time-stamped tokens with expiration
 * - Hash chain for audit trail
 * - Tamper detection
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const RECEIPT_SECRET = process.env.RECEIPT_SIGNING_SECRET || process.env.ENCRYPTION_SECRET_KEY || crypto.randomBytes(32).toString('hex');
const RECEIPT_EXPIRY_DAYS = 365 * 5; // Receipts valid for 5 years

// ============================================================================
// TYPES
// ============================================================================

export interface ReceiptPayload {
    receiptId: string;          // Payment ID / Receipt ID
    studentUid: string;         // Student UID (for ownership verification)
    enrollmentId: string;       // Student enrollment ID
    studentName: string;        // Student name
    amount: number;             // Payment amount
    method: 'Online' | 'Offline'; // Payment method
    sessionYear: string;        // Session year (e.g., "2026-2028")
    issuedAt: number;           // Timestamp when receipt was issued
    expiresAt: number;          // Timestamp when verification expires
    version: number;            // Schema version for future upgrades
}

export interface ReceiptVerificationResult {
    valid: boolean;
    status: 'valid' | 'invalid' | 'expired' | 'tampered' | 'not_found';
    message: string;
    receiptData?: {
        studentName: string;
        enrollmentId: string;
        paymentMethod: string;
        amount: number;
        sessionValidity: string;
        approvalStatus: string;
        issuedDate: string;
        receiptId: string;
        purpose?: string;
        verifiedAt: string;
    };
    suspicious?: boolean;
}

export interface InvisibleWatermark {
    studentUid: string;
    receiptId: string;
    timestampHash: string;
    issuerSignature: string;
}

// ============================================================================
// RECEIPT SIGNATURE GENERATION
// ============================================================================

/**
 * Generate a cryptographically signed receipt token
 * This token is embedded in the receipt barcode for verification
 * 
 * @param receiptId - The unique receipt/payment ID
 * @param studentUid - The student's UID
 * @param studentName - Student's name
 * @param enrollmentId - Student's enrollment ID
 * @param amount - Payment amount
 * @param method - Payment method
 * @param sessionYear - Session year string
 * @returns Encoded and signed token string
 */
export function generateReceiptSignature(
    receiptId: string,
    studentUid: string,
    studentName: string,
    enrollmentId: string,
    amount: number,
    method: 'Online' | 'Offline',
    sessionYear: string
): string {
    const now = Date.now();
    const expiresAt = now + (RECEIPT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // COMPACT PAYLOAD: Only essential data for verification
    // Full data is fetched from database during verification
    const compactPayload = {
        r: receiptId,           // Receipt ID
        u: studentUid,          // Student UID  
        a: amount,              // Amount
        t: now,                 // Timestamp
        e: expiresAt,           // Expires
        v: 1                    // Version
    };

    // Create payload string
    const payloadString = JSON.stringify(compactPayload);

    // Create HMAC signature
    const hmac = crypto.createHmac('sha256', RECEIPT_SECRET);
    hmac.update(payloadString);
    const signature = hmac.digest('hex').substring(0, 12); // 12 chars for brevity

    // Combine payload with signature
    const signedPayload = { ...compactPayload, s: signature };

    // Encode as base64url (compact)
    const token = Buffer.from(JSON.stringify(signedPayload)).toString('base64url');

    // Add prefix for identification
    return `ADTU-R1-${token}`;
}

/**
 * Verify a receipt token and extract the payload
 * Supports both legacy full payload and new compact payload
 * 
 * @param token - The receipt verification token
 * @returns ReceiptPayload if valid, null if invalid/tampered
 */
export function verifyReceiptSignature(token: string): ReceiptPayload | null {
    try {
        // Check prefix
        if (!token.startsWith('ADTU-R1-')) {
            console.warn('Receipt token: Invalid prefix');
            return null;
        }

        // Extract base64 portion
        const base64Part = token.substring(8); // Remove 'ADTU-R1-'

        // Decode
        const decodedString = Buffer.from(base64Part, 'base64url').toString('utf8');
        const signedPayload = JSON.parse(decodedString);

        // Detect compact vs legacy format
        const isCompact = 'r' in signedPayload && 's' in signedPayload;

        if (isCompact) {
            // COMPACT FORMAT: { r, u, a, t, e, v, s }
            const { s: signature, ...payload } = signedPayload;

            // Recreate signature to verify
            const hmac = crypto.createHmac('sha256', RECEIPT_SECRET);
            hmac.update(JSON.stringify(payload));
            const expectedSig = hmac.digest('hex').substring(0, 12);

            // Constant-time comparison
            if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
                console.warn('Receipt token: Signature mismatch - possible tampering');
                return null;
            }

            // Check expiration
            if (Date.now() > payload.e) {
                console.warn('Receipt token: Expired');
                return null;
            }

            // Map compact to full payload
            return {
                receiptId: payload.r,
                studentUid: payload.u,
                enrollmentId: '', // Fetched from DB
                studentName: '', // Fetched from DB
                amount: payload.a,
                method: 'Online', // Fetched from DB
                sessionYear: '', // Fetched from DB
                issuedAt: payload.t,
                expiresAt: payload.e,
                version: payload.v
            };
        } else {
            // LEGACY FORMAT: Full payload with 'sig'
            const { sig, ...payload } = signedPayload;

            const hmac = crypto.createHmac('sha256', RECEIPT_SECRET);
            hmac.update(JSON.stringify(payload));
            const expectedSig = hmac.digest('hex').substring(0, 16);

            if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
                console.warn('Receipt token: Signature mismatch - possible tampering');
                return null;
            }

            if (Date.now() > payload.expiresAt) {
                console.warn('Receipt token: Expired');
                return null;
            }

            return payload as ReceiptPayload;
        }

    } catch (error) {
        console.error('Receipt token verification failed:', error);
        return null;
    }
}

/**
 * Quick validation (signature check only, no decryption)
 * Supports both compact and legacy formats
 */
export function quickValidateReceiptToken(token: string): boolean {
    try {
        if (!token.startsWith('ADTU-R1-')) {
            return false;
        }

        const base64Part = token.substring(8);
        const decoded = JSON.parse(Buffer.from(base64Part, 'base64url').toString('utf8'));

        // Detect compact vs legacy format
        const isCompact = 'r' in decoded && 's' in decoded;

        if (isCompact) {
            const { s: signature, ...payload } = decoded;
            const hmac = crypto.createHmac('sha256', RECEIPT_SECRET);
            hmac.update(JSON.stringify(payload));
            const expectedSig = hmac.digest('hex').substring(0, 12);
            return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
        } else {
            const { sig, ...payload } = decoded;
            const hmac = crypto.createHmac('sha256', RECEIPT_SECRET);
            hmac.update(JSON.stringify(payload));
            const expectedSig = hmac.digest('hex').substring(0, 16);
            return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
        }
    } catch {
        return false;
    }
}

// ============================================================================
// INVISIBLE WATERMARK GENERATION
// ============================================================================

/**
 * Generate invisible watermark data for forensic tracking
 * This data is embedded in PDF metadata and can be extracted later
 */
export function generateInvisibleWatermark(
    studentUid: string,
    receiptId: string,
    issuedAt: Date = new Date()
): InvisibleWatermark {
    // Create timestamp hash
    const timestampHash = crypto
        .createHash('sha256')
        .update(`${studentUid}:${receiptId}:${issuedAt.toISOString()}`)
        .digest('hex')
        .substring(0, 16);

    // Create issuer signature
    const issuerSignature = crypto
        .createHmac('sha256', RECEIPT_SECRET)
        .update(`ADTU:ITMS:${receiptId}:${studentUid}`)
        .digest('hex')
        .substring(0, 32);

    return {
        studentUid,
        receiptId,
        timestampHash,
        issuerSignature
    };
}

/**
 * Verify invisible watermark data
 */
export function verifyInvisibleWatermark(watermark: InvisibleWatermark): boolean {
    try {
        // Recreate issuer signature
        const expectedSignature = crypto
            .createHmac('sha256', RECEIPT_SECRET)
            .update(`ADTU:ITMS:${watermark.receiptId}:${watermark.studentUid}`)
            .digest('hex')
            .substring(0, 32);

        return crypto.timingSafeEqual(
            Buffer.from(watermark.issuerSignature),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}

// ============================================================================
// VISIBLE WATERMARK TEXT GENERATION
// ============================================================================

/**
 * Generate visible watermark text for the receipt
 */
export function generateVisibleWatermarkText(): string {
    return `AdtU ITMS System Verified`;
}

// ============================================================================
// BARCODE DATA GENERATION
// ============================================================================

/**
 * Generate data for the receipt verification barcode
 * Returns a compact, signed token suitable for QR codes
 */
export function generateReceiptBarcodeData(
    receiptId: string,
    studentUid: string,
    studentName: string,
    enrollmentId: string,
    amount: number,
    method: 'Online' | 'Offline',
    sessionYear: string
): string {
    return generateReceiptSignature(
        receiptId,
        studentUid,
        studentName,
        enrollmentId,
        amount,
        method,
        sessionYear
    );
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

export const ReceiptSecurityService = {
    generateReceiptSignature,
    verifyReceiptSignature,
    quickValidateReceiptToken,
    generateInvisibleWatermark,
    verifyInvisibleWatermark,
    generateVisibleWatermarkText,
    generateReceiptBarcodeData
};

export default ReceiptSecurityService;
