import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import puppeteer, { Browser } from "puppeteer";
import fs from "fs";
import path from "path";
import { verifyToken, adminDb } from "@/lib/firebase-admin";

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

    // 2. Fetch Payment Details from Supabase
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false }
    });

    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("payment_id", paymentId)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
    }

    // 3. Security Check: Only allow students to download their own receipt, and admins/mods to download any
    if (userData.role === 'student' && payment.student_uid !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Load ADTU Logo
    let logoSvg = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "adtu-new-logo.svg");
      if (fs.existsSync(logoPath)) {
        logoSvg = fs.readFileSync(logoPath, "utf8");
      }
    } catch (err) {
      console.warn("⚠️ Could not load logo SVG:", err);
    }

    // 5. Format Data for Receipt
    const dateStr = new Date(payment.transaction_date || payment.created_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const timeStr = new Date(payment.transaction_date || payment.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    const sessionInfo = `${payment.session_start_year} - ${payment.session_end_year}`;

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
    if (payment.method === 'Offline' || payment.method === 'manual') {
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

    // 6. Build Receipt HTML
    const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
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
    }

    .container {
        width: 100%;
        max-width: 800px;
        margin: 0 auto;
        background: #ffffff;
        padding: 40px 50px;
        min-height: 100vh;
        position: relative;
    }

    /* Header Styling */
    .header { 
      display: flex; 
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 25px;
      border-bottom: 2px solid #f1f5f9;
      margin-bottom: 35px;
    }
    .brand { max-width: 450px; }
    .brand svg { height: 50px; width: auto; display: block; margin-bottom: 12px; }
    .brand-address { font-size: 10px; color: #64748b; line-height: 1.6; }
    
    .receipt-meta { text-align: right; }
    .receipt-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 2px; }
    .receipt-id { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px; font-family: 'Courier New', monospace; }
    .date-box { border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
    .date-value { font-size: 10px; font-weight: 600; color: #475569; }

    /* Title Section */
    .section-title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 30px;
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
    }
    .validity-icon { font-size: 20px; }
    .validity-text { font-size: 12px; color: #1e40af; font-weight: 500; }
    .validity-highlight { font-weight: 700; color: #1d4ed8; }

    /* Footer Branding */
    .footer {
        border-top: 2px solid #f1f5f9;
        padding-top: 25px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
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
    .watermark {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-30deg);
        font-size: 100px;
        font-weight: 900;
        color: #f8fafc;
        z-index: -1;
        pointer-events: none;
        user-select: none;
        text-transform: uppercase;
        opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="watermark">ADTU PAID</div>

    <div class="header">
      <div class="brand">
        ${logoSvg}
        <div class="brand-address">
          Assam down town University,<br>
          Sankar Madhab Path, Gandhi Nagar, Panikhaiti,<br>
          Guwahati, Assam - 781026, India
        </div>
      </div>
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
          <div class="stat-value">${isFirstTimePayer ? 'NULL' : formatValidityDate(prevValidUntil)}</div>
          <div class="stat-sub">${isFirstTimePayer ? 'First-time registration' : 'Validity before this renewal'}</div>
          <div style="margin-top: 8px;">
            <div class="field-label" style="margin-bottom: 2px;">Session Status</div>
            <div class="stat-sub" style="color: #64748b; font-weight: 600;">Year: ${isFirstTimePayer ? 'NULL' : (metadata.previousSessionEndYear || 'N/A')}</div>
          </div>
        </div>
        <div class="stat-card final">
          <div class="stat-label">Final Stats (Post-Payment)</div>
          <div class="stat-value">${formatValidityDate(nextValidUntil)}</div>
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

    <div class="validity-strip">
      <div class="validity-icon">🗓️</div>
      <div class="validity-text">
        This payment covers the transportation subscription for session 
        <span class="validity-highlight">${sessionInfo}</span>. 
        Service is valid until <span class="validity-highlight">${new Date(payment.valid_until).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>.
      </div>
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

    // 7. Generate PDF (Optimized)
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(receiptHTML, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      });

      // 8. Return PDF
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Receipt_${paymentId}.pdf"`
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
