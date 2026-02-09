import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser } from "puppeteer";
import fs from "fs";
import path from "path";
import { verifyToken, adminDb } from "@/lib/firebase-admin";
import { checkRateLimit, createRateLimitId, RateLimits } from "@/lib/security/rate-limiter";
import {
  generateVisibleWatermarkText,
  generateInvisibleWatermark
} from "@/lib/security/receipt-security.service";
import {
  DocumentCryptoService,
  buildDocumentPayload,
  generateSecureQRData
} from "@/lib/security/document-crypto.service";
import QRCode from 'qrcode';
import { paymentsSupabaseService } from "@/lib/services/payments-supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

// Singleton browser instance
let browserInstance: Browser | null = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }
  return browserInstance;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;

  try {
    // 1. Verify Authentication
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await verifyToken(token);
    const userId = decodedToken.uid;

    // Get user data to determine role
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Rate limiting - prevent abuse of receipt generation
    const rateLimitId = createRateLimitId(userId, 'receipt-download');
    const rateCheck = checkRateLimit(rateLimitId, 30, 60000); // 30 per minute
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many receipt download requests. Please wait.' },
        { status: 429 }
      );
    }

    // 2. Fetch Payment Details using paymentsSupabaseService
    // ✅ This properly decrypts sensitive fields (student_name, offline_transaction_id)
    const payment = await paymentsSupabaseService.getPaymentById(paymentId);

    if (!payment) {
      return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
    }

    // 3. Security Check: Only allow students to download their own receipt, and admins/mods to download any
    if (userData.role === 'student') {
      let isAuthorized = false;

      // Check 1: Match by UID
      if (payment.student_uid && payment.student_uid === userId) {
        isAuthorized = true;
      }

      // Check 2: Match by Enrollment ID (if UID check failed or UID missing)
      if (!isAuthorized && payment.student_id) {
        let enrollmentId = userData.enrollmentId;

        // If enrollmentId missing in user doc, check student profile
        if (!enrollmentId) {
          try {
            const studentDoc = await adminDb.collection('students').doc(userId).get();
            if (studentDoc.exists) {
              enrollmentId = studentDoc.data()?.enrollmentId;
            }
          } catch (e) {
            console.warn('Failed to fetch student profile for authentication check', e);
          }
        }

        if (enrollmentId && payment.student_id === enrollmentId) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        console.warn(`Unauthorized receipt access attempt by student ${userId} for payment ${paymentId}`);
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 4. Generate RSA-2048 Digital Signature for Tamper-Proof Receipt
    // This creates a cryptographic binding between all receipt fields
    const paymentMethod = (payment.method || 'Offline') as 'Online' | 'Offline';
    const sessionYear = `${payment.session_start_year || ''} - ${payment.session_end_year || ''}`;

    // Build document payload with required fields for signing
    const documentPayload = buildDocumentPayload({
      payment_id: paymentId,
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

    // Generate secure QR data (contains Receipt ID + RSA signature)
    const secureQRToken = generateSecureQRData(documentPayload);

    // Generate and store the full signature for database verification
    const fullSignature = DocumentCryptoService.signDocumentPayload(documentPayload);

    // Store signature in database (async, non-blocking for PDF generation)
    paymentsSupabaseService.storeDocumentSignature(paymentId, fullSignature)
      .then(stored => {
        if (stored) {
          console.log(`🔐 Document signature stored for receipt: ${paymentId}`);
        } else {
          console.warn(`⚠️ Failed to store document signature for: ${paymentId}`);
        }
      })
      .catch(err => console.error('Signature storage error:', err));

    // Generate visible watermark text (personalized for security)
    const visibleWatermarkText = generateVisibleWatermarkText();

    // Extract values for receipt display
    const studentUid = payment.student_uid || '';
    const studentName = payment.student_name || 'Unknown';
    const createdAt = payment.created_at || new Date().toISOString();
    const transactionDate = payment.transaction_date || createdAt;

    // Generate invisible watermark (embedded in PDF metadata)
    const invisibleWatermark = generateInvisibleWatermark(
      studentUid,
      paymentId,
      new Date(createdAt)
    );

    // Generate verification QR code as Data URL
    // Using the new secure token format (ADTU-R2-...)
    let qrCodeDataUrl = '';
    try {
      console.log('🔐 Generating secure QR with RSA-2048 signature:', secureQRToken.substring(0, 50) + '...');
      qrCodeDataUrl = await QRCode.toDataURL(secureQRToken, {
        errorCorrectionLevel: 'M', // Medium error correction (balance between size and reliability)
        margin: 3,
        width: 200, // Larger for better scanning
        color: {
          dark: '#000000', // Pure black for maximum contrast
          light: '#ffffff'
        }
      });
      console.log('✅ Secure QR code generated successfully, length:', qrCodeDataUrl.length);
    } catch (qrError) {
      console.warn('QR code generation failed:', qrError);
    }

    // 5. Load ADTU Logo
    let logoSvg = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "adtu-new-logo.svg");
      if (fs.existsSync(logoPath)) {
        logoSvg = fs.readFileSync(logoPath, "utf8");
      }
    } catch (err) {
      console.warn("⚠️ Could not load logo SVG:", err);
    }

    // 6. Format Data for Receipt
    const dateStr = new Date(transactionDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const timeStr = new Date(transactionDate).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    const sessionInfo = sessionYear;

    // Validity Progression Data
    const metadata = payment.metadata || {};
    const prevValidUntil = metadata.previousValidUntil;
    const nextValidUntil = payment.valid_until;
    const isFirstTimePayer = !prevValidUntil || payment.purpose === 'new_registration';

    const formatValidityDate = (dateStr: string | null) => {
      if (!dateStr) return "N/A";
      try {
        return new Date(dateStr).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
      } catch (e) {
        return "N/A";
      }
    };

    // Handle approvedBy formatting
    let approvedByDisplay = "ADTU Integrated Transport Management System (ITMS)";
    if (paymentMethod === 'Offline') {
      if (payment.approved_by && typeof payment.approved_by === 'object') {
        const name = payment.approved_by.name || "Staff";
        const role = payment.approved_by.role || 'moderator';
        if (role.toLowerCase() === 'admin') {
          approvedByDisplay = `${name} (Admin)`;
        } else {
          approvedByDisplay = `${name} (${payment.approved_by.empId || 'Moderator'})`;
        }
      } else if (payment.approved_by) {
        approvedByDisplay = String(payment.approved_by);
      }
    }

    // 7. Build Receipt HTML with Security Features
    const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt - ${payment.student_name} - ${paymentId} | ADTU Bus Services</title>
  <meta name="adtu-receipt-id" content="${paymentId}">
  <meta name="adtu-student-uid" content="${invisibleWatermark.studentUid}">
  <meta name="adtu-timestamp-hash" content="${invisibleWatermark.timestampHash}">
  <meta name="adtu-issuer-signature" content="${invisibleWatermark.issuerSignature}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
    
    body { 
      font-family: 'Inter', sans-serif; 
      margin: 0; 
      padding: 0;
      background: #ffffff;
      color: #1e293b;
      line-height: 1.5;
      -webkit-user-select: none;
      user-select: none;
    }

    .container {
        width: 100%;
        max-width: 800px;
        margin: 0 auto;
        background: #ffffff;
        padding: 40px 50px;
        min-height: 100vh;
        position: relative;
        overflow: hidden;
    }

    /* Visible Security Watermark */
    .security-watermark {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
        user-select: none;
        opacity: 0.08;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='150'%3E%3Ctext x='50%25' y='50%25' font-family='Inter, sans-serif' font-weight='800' font-size='12' text-anchor='middle' alignment-baseline='middle' fill='%2364748b' transform='rotate(-30 125 75)'%3EAdtU ITMS System Verified%3C/text%3E%3C/svg%3E");
        background-repeat: repeat;
    }

    /* Header Styling */
    .header { 
      display: flex; 
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 25px;
      border-bottom: 2px solid #f1f5f9;
      margin-bottom: 35px;
      position: relative;
      z-index: 2;
    }
    .brand { max-width: 280px; flex-shrink: 0; }
    .brand svg { height: 50px; width: auto; display: block; margin-bottom: 12px; }
    .brand-address { font-size: 10px; color: #64748b; line-height: 1.6; }
    
    .receipt-meta { text-align: right; }
    .receipt-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 2px; }
    .receipt-id { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px; font-family: 'Courier New', monospace; }
    .date-box { padding-top: 8px; margin-top: 4px; }
    .date-value { font-size: 10px; font-weight: 600; color: #475569; }

    /* Verification QR Section - Centered */
    .verification-qr {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding: 0 15px;
        flex-shrink: 0;
    }
    .verification-qr img {
        width: 120px;
        height: 120px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        image-rendering: pixelated;
    }
    .verification-qr-label {
        font-size: 7px;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-top: 6px;
        font-weight: 600;
    }
    .verification-qr-text {
        font-size: 8px;
        color: #94a3b8;
        line-height: 1.4;
    }
    .verification-qr-text strong {
        color: #475569;
        font-size: 9px;
        display: block;
        margin-bottom: 2px;
    }

    /* Title Section */
    .section-title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 30px;
        position: relative;
        z-index: 2;
    }
    .title-text {
        font-size: 24px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.02em;
        margin: 0;
    }
    .badge {
        background: #f0fdf4;
        color: #166534;
        padding: 4px 12px;
        border-radius: 100px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border: 1px solid #dcfce7;
    }

    /* Content Grid */
    .receipt-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 25px;
        margin-bottom: 30px;
        position: relative;
        z-index: 2;
    }
    .info-group {
        padding: 18px;
        background: #f8fafc;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
    }
    .field-label {
        font-size: 9px;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
    }
    .field-value {
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
    }
    .primary-value {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
    }

    /* Stats Section */
    .stats-section {
        margin-bottom: 30px;
        position: relative;
        z-index: 2;
    }
    .stats-header {
        font-size: 11px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .stats-header::after {
        content: "";
        flex: 1;
        height: 1px;
        background: #e2e8f0;
    }
    .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 25px;
    }
    .stat-card {
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .stat-card.initial {
        background: #fffafa;
        border-color: #fee2e2;
    }
    .stat-card.final {
        background: #f0f9ff;
        border-color: #bae6fd;
    }
    .stat-label {
        font-size: 10px;
        font-weight: 700;
        color: #64748b;
    }
    .stat-value {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
    }
    .stat-sub {
        font-size: 9px;
        color: #94a3b8;
    }

    /* Payment Summary */
    .summary-box {
        background: #0f172a;
        color: #ffffff;
        padding: 25px 30px;
        border-radius: 14px;
        margin-bottom: 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 8px 20px -5px rgba(15, 23, 42, 0.15);
        border-right: 4px solid #3b82f6;
        position: relative;
        z-index: 2;
    }
    .amount-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
    .amount-value { font-size: 32px; font-weight: 800; }
    .amount-currency { font-size: 18px; font-weight: 400; opacity: 0.7; }

    /* Validity Strip */
    .validity-strip {
        display: flex;
        background: #eff6ff;
        border: 1px solid #dbeafe;
        border-radius: 10px;
        padding: 15px 20px;
        margin-bottom: 30px;
        align-items: center;
        gap: 15px;
        position: relative;
        z-index: 2;
    }
    .validity-icon { font-size: 20px; }
    .validity-text { font-size: 12px; color: #1e40af; font-weight: 500; }
    .validity-highlight { font-weight: 700; color: #1d4ed8; }

    /* Screenshot Warning */
    .screenshot-warning {
        background: linear-gradient(90deg, #fef3c7, #fde68a);
        border: 1px solid #f59e0b;
        border-radius: 8px;
        padding: 10px 15px;
        margin-bottom: 20px;
        font-size: 9px;
        color: #92400e;
        display: flex;
        align-items: center;
        gap: 8px;
        position: relative;
        z-index: 2;
    }
    .screenshot-warning svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }

    /* Footer Branding */
    .footer {
        border-top: 2px solid #f1f5f9;
        padding-top: 25px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        position: relative;
        z-index: 2;
    }
    .footer-stamp {
        font-size: 9px;
        color: #94a3b8;
        line-height: 1.6;
    }
    .footer-tag {
        font-size: 10px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Multi-layer visible watermark -->
    <div class="security-watermark"></div>

    <div class="header">
      <div class="brand">
        ${logoSvg}
        <div class="brand-address">
          Assam down town University,<br>
          Sankar Madhab Path, Gandhi Nagar, Panikhaiti,<br>
          Guwahati, Assam - 781026, India
        </div>
      </div>
      ${qrCodeDataUrl ? `
      <div class="verification-qr">
        <img src="${qrCodeDataUrl}" alt="Verification QR" />
        <div class="verification-qr-label">Scan to Verify</div>
      </div>
      ` : ''}
      <div class="receipt-meta">
        <div class="receipt-label">Transaction Receipt</div>
        <div class="receipt-id">${paymentId}</div>
        <div class="date-box">
          <div class="receipt-label">Date & Time</div>
          <div class="date-value">${dateStr} | ${timeStr}</div>
        </div>
      </div>
    </div>

    <div class="section-title">
      <h1 class="title-text">Payment Receipt</h1>
      <span class="badge">Verified Payment</span>
    </div>

    <div class="receipt-grid">
      <div class="info-group">
        <div class="field-label">Student Information</div>
        <div class="primary-value">${payment.student_name}</div>
        <div style="margin-top: 10px;">
          <div class="field-label">Enrollment ID</div>
          <div class="field-value">${payment.student_id}</div>
        </div>
        <div style="margin-top: 10px;">
          <div class="field-label">Department / Faculty</div>
          <div class="field-value">${payment.metadata?.faculty || 'Bachelors of Technology'}</div>
        </div>
      </div>
      <div class="info-group">
        <div class="field-label">Transaction Details</div>
        <div class="field-value" style="color: #0f172a; font-weight: 700;">${payment.method} Payment</div>
        <div style="margin-top: 10px;">
          <div class="field-label">Payment ID</div>
          <div class="field-value" style="font-family: monospace; font-size: 11px;">${payment.payment_id || 'N/A'}</div>
        </div>
        ${payment.razorpay_order_id ? `
        <div style="margin-top: 10px;">
          <div class="field-label">Order ID</div>
          <div class="field-value" style="font-family: monospace; font-size: 11px;">${payment.razorpay_order_id}</div>
        </div>
        ` : payment.offline_transaction_id ? `
        <div style="margin-top: 10px;">
          <div class="field-label">Ref. Transaction ID</div>
          <div class="field-value" style="font-family: monospace; font-size: 11px;">${payment.offline_transaction_id}</div>
        </div>
        ` : ''}
        <div style="margin-top: 10px;">
          <div class="field-label">Approved By</div>
          <div class="field-value" style="font-size: 11px; color: #1e40af;">${approvedByDisplay}</div>
        </div>
      </div>
    </div>

    <!-- Validity Stats Section -->
    <div class="stats-section">
      <div class="stats-header">Subscription Progression</div>
      <div class="stats-grid">
        <div class="stat-card initial">
          <div class="stat-label">Initial Stats (Pre-Payment)</div>
          ${isFirstTimePayer ?
        `<div class="stat-value" style="margin-top: 15px; color: #94a3b8; font-size: 11px;">Not Applicable (New Admission)</div>` :
        `
            <div class="stat-value">${formatValidityDate(prevValidUntil || null)}</div>
            <div class="stat-sub">Validity before this renewal</div>
            <div style="margin-top: 8px;">
              <div class="field-label" style="margin-bottom: 2px;">Session Status</div>
              <div class="stat-sub" style="color: #64748b; font-weight: 600;">Year: ${metadata.previousSessionEndYear || 'N/A'}</div>
            </div>
            `
      }
        </div>
        <div class="stat-card final">
          <div class="stat-label">Final Stats (Post-Payment)</div>
          <div class="stat-value">${formatValidityDate(nextValidUntil || null)}</div>
          <div class="stat-sub">Updated validity after payment</div>
          <div style="margin-top: 8px;">
            <div class="field-label" style="margin-bottom: 2px;">Updated Session</div>
            <div class="stat-sub" style="color: #0369a1; font-weight: 600;">Year: ${payment.session_end_year || 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="summary-box">
      <div>
        <div class="amount-label">Total Amount Paid</div>
        <div style="font-size: 10px; color: #94a3b8; margin-top: 3px;">Towards Bus Transportation Service</div>
      </div>
      <div class="amount-value"><span class="amount-currency">₹</span>${Number(payment.amount).toLocaleString('en-IN')}</div>
    </div>

    <div class="screenshot-warning">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9v4m0 4h.01M5.07 19H18.93c1.93 0 3.12-2.09 2.13-3.77l-6.93-12a2.5 2.5 0 00-4.26 0l-6.93 12C1.95 16.91 3.14 19 5.07 19z"/></svg>
      <span><strong>Security Notice:</strong> This document contains traceable identifiers. Screenshots and copies can be traced back to the original owner. Do not share this receipt.</span>
    </div>

    <div class="footer">
      <div class="footer-stamp">
        This is a computer generated receipt. No signature required.<br>
        ADTU Integrated Transport Management System (ITMS)<br>
        © ${new Date().getFullYear()} Assam down town University
      </div>
      <div class="footer-tag">Official Receipt</div>
    </div>
  </div>
</body>
</html>
        `;

    // 8. Generate PDF (Optimized)
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(receiptHTML, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      });

      // 9. Return PDF with security headers
      const sanitizedStudentName = studentName.replace(/\s+/g, '_');
      const safeFilename = `Receipt_${sanitizedStudentName}_${paymentId}.pdf`;

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          // Security headers to discourage tampering
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache"
        }
      });
    } finally {
      await page.close();
    }

  } catch (error: any) {
    console.error("❌ Receipt generation error:", error);
    return NextResponse.json({ error: "Failed to generate receipt" }, { status: 500 });
  }
}
