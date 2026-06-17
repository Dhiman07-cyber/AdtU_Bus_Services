import QRCode from 'qrcode';
import {
  DocumentCryptoService,
  generateSecureQRData,
  buildDocumentPayloadFromPayment,
} from '@/lib/security/document-crypto.service';
import { paymentsSupabaseService, type PaymentRecord } from '@/lib/services/payments-supabase';
import { renderReceiptPdf } from '@/lib/services/receipt-pdf';

export type ReceiptSignatureResult = {
  ok: boolean;
  signature: string | null;
  status: 'valid_existing' | 'created' | 'race_existing' | 'invalid_existing' | 'store_failed' | 'not_completed' | 'signing_failed';
};

function getApprovedByDisplay(payment: PaymentRecord): string {
  if (payment.method !== 'Offline') {
    return 'ADTU Integrated Transit Management System (ITMS)';
  }

  const approvedBy = payment.approved_by;
  if (!approvedBy) return 'ADTU ITMS System';

  if (typeof approvedBy === 'object') {
    const name = approvedBy.name || 'Staff';
    const role = approvedBy.role || 'Moderator';
    const empId = approvedBy.empId || approvedBy.userId || role;
    return `${name} (${empId})`;
  }

  return String(approvedBy);
}

function getPaymentReference(payment: PaymentRecord): string | undefined {
  return payment.razorpay_payment_id || payment.razorpay_order_id || payment.offline_transaction_id;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asOptionalStringOrNumber(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export async function getOrCreateReceiptSignature(payment: PaymentRecord): Promise<string | null> {
  const result = await ensureReceiptSignature(payment);
  return result.ok ? result.signature : null;
}

export async function ensureReceiptSignature(payment: PaymentRecord): Promise<ReceiptSignatureResult> {
  if (payment.status !== 'Completed') {
    return { ok: false, signature: null, status: 'not_completed' };
  }

  const documentPayload = buildDocumentPayloadFromPayment(payment);

  if (payment.document_signature) {
    if (DocumentCryptoService.verifyDocumentSignature(documentPayload, payment.document_signature)) {
      return { ok: true, signature: payment.document_signature, status: 'valid_existing' };
    }

    console.error('[ReceiptService] Stored receipt signature failed verification; refusing to overwrite', {
      paymentId: payment.payment_id,
    });
    return { ok: false, signature: null, status: 'invalid_existing' };
  }

  let signature: string;
  try {
    signature = DocumentCryptoService.signDocumentPayload(documentPayload);
  } catch {
    return { ok: false, signature: null, status: 'signing_failed' };
  }

  const stored = await paymentsSupabaseService.storeDocumentSignature(payment.payment_id, signature, {
    onlyIfMissing: true,
  });

  if (stored) {
    return { ok: true, signature, status: 'created' };
  }

  // Another request may have stored the same receipt signature first.
  const existingSignature = await paymentsSupabaseService.getDocumentSignature(payment.payment_id);
  if (existingSignature && DocumentCryptoService.verifyDocumentSignature(documentPayload, existingSignature)) {
    return { ok: true, signature: existingSignature, status: 'race_existing' };
  }

  return { ok: false, signature: null, status: 'store_failed' };
}

export async function generateReceiptPdf(paymentId: string): Promise<Buffer | null> {
  try {
    const payment = await paymentsSupabaseService.getPaymentById(paymentId);
    if (!payment || payment.status !== 'Completed') {
      return null;
    }

    const signature = await getOrCreateReceiptSignature(payment);
    if (!signature) return null;

    const documentPayload = buildDocumentPayloadFromPayment(payment);
    const secureQRToken = generateSecureQRData(documentPayload, signature);
    const qrCodeDataUrl = await QRCode.toDataURL(secureQRToken, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 200,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return renderReceiptPdf({
      receiptId: payment.payment_id,
      studentName: payment.student_name || 'Student',
      enrollmentId: payment.student_id || 'N/A',
      faculty: asOptionalString(payment.metadata?.faculty),
      amount: payment.amount || 0,
      paymentMethod: payment.method || 'Offline',
      paymentReference: getPaymentReference(payment),
      approvedBy: getApprovedByDisplay(payment),
      sessionStartYear: payment.session_start_year,
      sessionEndYear: payment.session_end_year,
      durationYears: payment.duration_years,
      validUntil: payment.valid_until,
      transactionDate: payment.transaction_date || payment.created_at || new Date().toISOString(),
      qrCodeDataUrl,
      previousValidUntil: asOptionalString(payment.metadata?.previousValidUntil),
      previousSessionEndYear: asOptionalStringOrNumber(payment.metadata?.previousSessionEndYear),
      purpose: payment.purpose,
    });
  } catch (error) {
    console.error('[ReceiptService] Receipt PDF generation failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
