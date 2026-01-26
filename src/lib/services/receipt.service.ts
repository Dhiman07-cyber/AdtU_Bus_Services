import puppeteer, { Browser } from "puppeteer";
import fs from "fs";
import path from "path";
import QRCode from 'qrcode';
import { paymentsSupabaseService } from "@/lib/services/payments-supabase";
import {
  generateVisibleWatermarkText,
  generateInvisibleWatermark
} from "@/lib/security/receipt-security.service";
import {
  DocumentCryptoService,
  buildDocumentPayload,
  generateSecureQRData
} from "@/lib/security/document-crypto.service";

// Singleton browser instance for server-side PDF generation
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

export async function generateReceiptPdf(paymentId: string): Promise<Buffer | null> {
  try {
    console.log('[ReceiptService] Generating PDF for paymentId:', paymentId);

    // 1. Fetch Payment Details
    const payment = await paymentsSupabaseService.getPaymentById(paymentId);
    if (!payment) {
      console.error('[ReceiptService] Payment not found in Supabase for paymentId:', paymentId);
      return null;
    }
    console.log('[ReceiptService] Payment found:', payment.student_name, 'Amount:', payment.amount);

    // 2. Security & Signature
    const paymentMethod = (payment.method || 'Offline') as 'Online' | 'Offline';
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

    const secureQRToken = generateSecureQRData(documentPayload);
    const fullSignature = DocumentCryptoService.signDocumentPayload(documentPayload);

    // Store signature
    await paymentsSupabaseService.storeDocumentSignature(paymentId, fullSignature);

    // 3. Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(secureQRToken, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 200,
      color: { dark: '#000000', light: '#ffffff' }
    });

    // 4. Load Logo
    let logoSvg = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "adtu-new-logo.svg");
      if (fs.existsSync(logoPath)) {
        logoSvg = fs.readFileSync(logoPath, "utf8");
      }
    } catch (err) {
      console.warn("⚠️ Could not load logo SVG:", err);
    }

    // 5. Format Strings
    const transactionDate = payment.transaction_date || payment.created_at || new Date().toISOString();
    const dateStr = new Date(transactionDate).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    });
    const timeStr = new Date(transactionDate).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true
    });

    const formatValidityDate = (d: string | null) => {
      if (!d) return "N/A";
      return new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
      });
    };

    let approvedByDisplay = "ADTU ITMS System";
    if (paymentMethod === 'Offline' && payment.approved_by) {
      const approvedBy = payment.approved_by as any;
      approvedByDisplay = `${approvedBy.name || 'Staff'} (${approvedBy.empId || approvedBy.role || 'Moderator'})`;
    }

    // 6. Template HTML (Shared with Route)
    const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
    body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: #ffffff; color: #1e293b; line-height: 1.5; }
    .container { width: 100%; max-width: 800px; margin: 0 auto; padding: 40px 50px; position: relative; }
    .security-watermark { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.08; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='150'%3E%3Ctext x='50%25' y='50%25' font-family='Inter, sans-serif' font-weight='800' font-size='12' text-anchor='middle' alignment-baseline='middle' fill='%2364748b' transform='rotate(-30 125 75)'%3EAdtU ITMS System Verified%3C/text%3E%3C/svg%3E"); background-repeat: repeat; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 25px; border-bottom: 2px solid #f1f5f9; margin-bottom: 35px; position: relative; z-index: 2; }
    .brand { max-width: 280px; }
    .brand svg { height: 50px; width: auto; margin-bottom: 12px; }
    .brand-address { font-size: 10px; color: #64748b; }
    .verification-qr { display: flex; flex-direction: column; align-items: center; }
    .verification-qr img { width: 100px; height: 100px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .receipt-meta { text-align: right; }
    .receipt-label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .receipt-id { font-size: 12px; font-weight: 700; font-family: monospace; }
    .title-text { font-size: 24px; font-weight: 800; margin: 0 0 30px 0; }
    .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-group { padding: 15px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }
    .field-label { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
    .field-value { font-size: 12px; font-weight: 600; }
    .progression-section { 
      margin: 20px 0; 
      padding: 20px; 
      background: #f8fafc; 
      border-radius: 12px; 
      border: 1px solid #e2e8f0;
      position: relative;
      overflow: hidden;
    }
    .progression-section::after {
      content: "";
      position: absolute;
      top: 0; left: 0; width: 4px; height: 100%;
      background: #0f172a;
    }
    .progression-title { 
      font-size: 9px; 
      font-weight: 800; 
      color: #64748b; 
      text-transform: uppercase; 
      margin-bottom: 15px; 
      letter-spacing: 1px;
    }
    .summary-box { background: #0f172a; color: #ffffff; padding: 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
    .amount-value { font-size: 28px; font-weight: 800; }
    .validity-strip { background: #eff6ff; border-radius: 10px; padding: 12px; margin: 20px 0; font-size: 11px; color: #1e40af; border: 1px solid #dbeafe; }
    .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 40px; font-size: 9px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="security-watermark"></div>
    <div class="header">
      <div class="brand">
        ${logoSvg}
        <div class="brand-address">Assam down town University, Guwahati, Assam</div>
      </div>
      <div class="verification-qr"><img src="${qrCodeDataUrl}" /></div>
      <div class="receipt-meta">
        <div class="receipt-label">Receipt ID</div>
        <div class="receipt-id">${paymentId}</div>
        <div style="margin-top: 10px;">
          <div class="receipt-label">Date</div>
          <div class="field-value">${dateStr} | ${timeStr}</div>
        </div>
      </div>
    </div>
    <h1 class="title-text">Payment Receipt</h1>
    <div class="receipt-grid">
      <div class="info-group">
        <div class="field-label">Student</div>
        <div class="field-value" style="font-size: 14px;">${payment.student_name}</div>
        <div style="margin-top: 8px;">
          <div class="field-label">Enrollment ID</div>
          <div class="field-value">${payment.student_id}</div>
        </div>
      </div>
      <div class="info-group">
        <div class="field-label">Method</div>
        <div class="field-value">${payment.method}</div>
        <div style="margin-top: 8px;">
          <div class="field-label">Approved By</div>
          <div class="field-value">${approvedByDisplay}</div>
        </div>
      </div>
    </div>
    <div class="progression-section">
      <div class="progression-title">Subscription Progression</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
        <div>
          <div class="field-label">Payment Period</div>
          <div class="field-value">${payment.session_start_year} - ${payment.session_end_year}</div>
        </div>
        <div>
          <div class="field-label">Session Duration</div>
          <div class="field-value">${payment.duration_years} Year(s)</div>
        </div>
        <div>
          <div class="field-label">Coverage Status</div>
          <div class="field-value" style="color: #059669; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Full Session Coverage
          </div>
        </div>
      </div>
    </div>
    <div class="validity-strip">
       Service Valid Until: <strong>${formatValidityDate(payment.valid_until || null)}</strong>
    </div>
    <div class="summary-box">
      <div class="field-label" style="color: #94a3b8;">Total Amount Paid</div>
      <div class="amount-value">₹${Number(payment.amount).toLocaleString('en-IN')}</div>
    </div>
    <div class="footer">
      This is a system-verified electronic receipt. © ${new Date().getFullYear()} AdtU Bus Services
    </div>
  </div>
</body>
</html>`;

    // 7. Generate PDF
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(receiptHTML, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  } catch (err) {
    console.error("Error generating PDF:", err);
    return null;
  }
}
