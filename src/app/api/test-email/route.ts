/**
 * Test Email Service API - Premium Edition
 * 
 * Features:
 * - Horizontal KPI cards (table-based, email-safe)
 * - Premium PDF attachment with full transaction list
 * - Real university branding (SVG logo in PDF)
 * - Enhanced Glassmorphism UI
 * 
 * IMPORTANT: Must run on Node.js runtime for SMTP and Puppeteer
 */

export const runtime = "nodejs";

import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { paymentsSupabaseService } from "@/lib/services/payments-supabase";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

/* ============================================================
   POST: Send Email with PDF Attachment
   ============================================================ */
export async function POST() {
  try {
    // 1. Read environment variables
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const GMAIL_PASS = process.env.GMAIL_PASS;

    // 2. Validate environment variables
    const missing: string[] = [];
    if (!ADMIN_EMAIL) missing.push("ADMIN_EMAIL");
    if (!GMAIL_PASS) missing.push("GMAIL_PASS");

    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // 3. Load Logo
    let logoSvg = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "adtu-new-logo.svg");
      if (fs.existsSync(logoPath)) {
        logoSvg = fs.readFileSync(logoPath, 'utf8');
      }
    } catch (err) {
      console.warn("⚠️ Could not load logo SVG:", err);
    }

    // 4. Fetch real transaction data from Supabase
    let transactions: any[] = [];
    let fetchError = null;

    try {
      if (paymentsSupabaseService.isReady()) {
        transactions = await paymentsSupabaseService.getRecentTransactions(50);
        console.log(`📊 Fetched ${transactions.length} transactions from Supabase`);
      } else {
        fetchError = "Supabase not configured";
      }
    } catch (err: any) {
      fetchError = err.message;
      console.warn("⚠️ Could not fetch transactions:", err.message);
    }

    // 5. Use sample data if no real data available
    const hasRealData = transactions.length > 0;
    if (!hasRealData) {
      transactions = [
        { payment_id: "SAMPLE_001", student_name: "Dhiman Saikia", amount: 5000, method: "Online", status: "Completed", created_at: new Date().toISOString() },
        { payment_id: "SAMPLE_002", student_name: "John Doe", amount: 10000, method: "Offline", status: "Completed", created_at: new Date().toISOString() },
        { payment_id: "SAMPLE_003", student_name: "Jane Smith", amount: 5000, method: "Online", status: "Pending", created_at: new Date().toISOString() },
      ];
    }

    // 6. Calculate summary & dates
    const totalAmount = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const completedCount = transactions.filter(t => t.status === "Completed").length;
    const pendingCount = transactions.filter(t => t.status === "Pending").length;

    // Financial Year Calculation (Previous Year - Current Year)
    const currentYear = new Date().getFullYear();
    const financialYear = `${currentYear - 1} - ${currentYear}`;

    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    const reportId = `ADTU-TRN-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 7. Build email HTML (Improved Premium UI)
    const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#020617;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="background:#020617;padding:40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:24px;border:1px solid #334155;overflow:hidden;box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
      
      <!-- Premium Header Gradient -->
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1 0%,#a855f7 50%,#ec4899 100%);padding:40px 30px;text-align:center;">
          <div style="background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);display:inline-block;padding:12px 24px;border-radius:16px;border:1px solid rgba(255,255,255,0.2);">
            <div style="font-size:24px;font-weight:bold;color:#fff;letter-spacing:1px;">ADTU BUS SERVICES</div>
            <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:4px;text-transform:uppercase;letter-spacing:2px;">Official Transaction Report</div>
          </div>
          <div style="margin-top:20px;">
            <span style="background:${hasRealData ? '#22c55e' : '#f59e0b'};color:#fff;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.2);">
              ${hasRealData ? '● REAL-TIME DATA' : '⚠ TEST DATA'}
            </span>
          </div>
        </td>
      </tr>

      <!-- Message Area -->
      <tr>
        <td style="padding:30px 30px 0;text-align:center;">
          <h2 style="margin:0;font-size:20px;color:#fff;">Daily Financial Overview</h2>
          <p style="color:#94a3b8;font-size:14px;margin-top:8px;">Financial Literacy ${financialYear} &middot; Generated on ${dateStr}</p>
        </td>
      </tr>

      <!-- KPI Cards -->
      <tr>
        <td style="padding:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33.33%" align="center" style="padding:8px;">
                <div style="background:#0f172a;border-radius:16px;padding:20px 10px;border:1px solid #334155;">
                  <div style="font-size:28px;font-weight:700;color:#fff;">${transactions.length}</div>
                  <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;">Volume</div>
                </div>
              </td>
              <td width="33.33%" align="center" style="padding:8px;">
                <div style="background:#0f172a;border-radius:16px;padding:20px 10px;border:1px solid #334155;">
                  <div style="font-size:28px;font-weight:700;color:#4ade80;">₹${(totalAmount / 1000).toFixed(1)}k</div>
                  <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;">Revenue</div>
                </div>
              </td>
              <td width="33.33%" align="center" style="padding:8px;">
                <div style="background:#0f172a;border-radius:16px;padding:20px 10px;border:1px solid #334155;">
                  <div style="font-size:28px;font-weight:700;color:#818cf8;">${completedCount}</div>
                  <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;">Settled</div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Info Section - NOW INSIDE DARK BG -->
      <tr>
        <td style="padding:0 24px 30px;">
          <div style="background:#0f172a;border-radius:20px;padding:24px;border:1px solid #334155;background:linear-gradient(to bottom, #0f172a, #1e293b);">
            <div style="display:flex;align-items:center;margin-bottom:16px;">
              <div style="font-size:20px;margin-right:12px;">📄</div>
              <div>
                <div style="font-size:14px;font-weight:600;color:#fff;">PDF Audit Report Attached</div>
                <div style="font-size:12px;color:#94a3b8;">Full history for Financial Literacy ${financialYear}</div>
              </div>
            </div>
            
            <div style="height:1px;background:#334155;margin:16px 0;"></div>
            
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#94a3b8;">
              <tr>
                <td style="padding:4px 0;"><strong>Sent From:</strong></td>
                <td style="padding:4px 0;text-align:right;"><span style="color:#818cf8;">ADTU ITMS</span></td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>Recipient:</strong></td>
                <td style="padding:4px 0;text-align:right;"><span style="color:#4ade80;">${ADMIN_EMAIL}</span></td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>System ID:</strong></td>
                <td style="padding:4px 0;text-align:right;color:#fff;">${reportId}</td>
              </tr>
            </table>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#020617;padding:30px;text-align:center;border-top:1px solid #334155;">
          <div style="color:#64748b;font-size:12px;letter-spacing:0.5px;">Institutional report from Assam down town University Transport Wing.</div>
          <div style="color:#475569;font-size:11px;margin-top:8px;">Confidential &middot; Financial Literacy ${financialYear}</div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>
    `;

    // 8. Generate PDF HTML (Institutional Enterprise Grade)
    const pdfHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
    
    body { 
      font-family: 'Inter', sans-serif; 
      margin: 0; 
      padding: 40px; 
      background: #ffffff;
      color: #111827;
      line-height: 1.5;
    }

    /* Header Styling */
    .header { 
      display: flex; 
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 25px;
      border-bottom: 1.5px solid #E5E7EB;
      margin-bottom: 35px;
    }
    .brand { max-width: 400px; }
    .brand svg { height: 50px; width: auto; display: block; margin-bottom: 12px; }
    .brand-address { font-size: 10px; color: #4B5563; line-height: 1.5; margin-top: 8px; }
    .copyright-line { font-size: 9px; color: #9CA3AF; margin-top: 6px; font-weight: 500; }
    
    .meta { text-align: right; }
    .meta-item { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .meta-value { font-size: 11px; font-weight: 700; color: #111827; margin-bottom: 10px; }

    /* Title & Badge */
    .report-header { margin-bottom: 30px; }
    .report-title-container { display: flex; align-items: center; gap: 12px; }
    .report-title { font-size: 24px; font-weight: 700; color: #111827; margin: 0; letter-spacing: -0.02em; }
    .status-badge { 
      background: #E6F0FF; 
      color: #1D4ED8; 
      padding: 4px 12px; 
      border-radius: 6px; 
      font-size: 11px; 
      font-weight: 700; 
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .report-subtitle { font-size: 14px; color: #6B7280; margin-top: 6px; }

    /* KPI Strip */
    .kpi-strip { 
      display: flex; 
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      margin-bottom: 40px;
      overflow: hidden;
    }
    .kpi-card { 
      flex: 1; 
      padding: 20px 24px;
      border-right: 1px solid #E5E7EB;
    }
    .kpi-card:last-child { border-right: none; }
    .kpi-label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-value { font-size: 26px; font-weight: 700; color: #111827; margin-top: 6px; }
    .kpi-value.money { color: #16A34A; }

    /* Table Styling */
    table { 
      width: 100%; 
      border-collapse: collapse; 
      font-size: 12px;
    }
    thead th { 
      background: #F3F4F6; 
      padding: 14px 10px; 
      text-align: left; 
      font-weight: 700; 
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
      border-bottom: 1.5px solid #E5E7EB;
    }
    tbody td { 
      padding: 14px 10px; 
      border-bottom: 1px solid #F3F4F6;
      color: #111827;
      vertical-align: middle;
    }
    tr:nth-child(even) { background-color: #FAFAFA; }
    
    .ref-id { font-family: 'Courier New', monospace; font-size: 10px; color: #1D4ED8; font-weight: 600; }
    .student-name { font-weight: 600; font-size: 12.5px; }
    .align-right { text-align: right; }
    
    .status-pill {
      padding: 4px 12px; 
      border-radius: 100px; 
      font-size: 10px; 
      font-weight: 700; 
      display: inline-block;
      text-transform: uppercase;
    }
    .status-completed { background: #DCFCE7; color: #166534; }
    .status-pending { background: #FEF3C7; color: #92400E; }
    .status-rejected { background: #FEE2E2; color: #991B1B; }

    .footer { 
      position: fixed;
      bottom: 30px;
      left: 40px;
      right: 40px;
      padding-top: 15px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${logoSvg}
      <div class="brand-address">
        Assam down town University,<br>
        Sankar Madhab Path, Gandhi Nagar,<br>
        Panikhaiti, Guwahati, Assam, India,<br>
        Pin – 781026
      </div>
    </div>
    <div class="meta">
      <div class="meta-item">Report Identifier</div>
      <div class="meta-value">${reportId}</div>
      <div class="meta-item">Administrative Cycle</div>
      <div class="meta-value">Financial Literacy ${financialYear}</div>
    </div>
  </div>

  <div class="report-header">
    <div class="report-title-container">
      <h1 class="report-title">Financial Transaction Register</h1>
      <span class="status-badge">Official Core Data</span>
    </div>
    <p class="report-subtitle">Historical records for Financial Literacy ${financialYear} authenticated on ${dateStr}.</p>
  </div>

  <div class="kpi-strip">
    <div class="kpi-card">
      <div class="kpi-label">Volume</div>
      <div class="kpi-value">${transactions.length} Records</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gross Value</div>
      <div class="kpi-value money">₹${totalAmount.toLocaleString('en-IN')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Settlement</div>
      <div class="kpi-value">${transactions.length > 0 ? Math.round((completedCount / transactions.length) * 100) : 0}%</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th width="30">#</th>
        <th>Reference ID</th>
        <th>Student Account</th>
        <th class="align-right">Amount</th>
        <th>Payment Type</th>
        <th>Settlement Result</th>
        <th class="align-right">System Date</th>
      </tr>
    </thead>
    <tbody>
      ${transactions.map((t, i) => {
      const paymentId = t.payment_id || t.paymentId || 'N/A';
      const date = t.created_at || t.createdAt || t.transaction_date;
      const dateFormatted = date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
      return `
          <tr>
            <td style="color: #9CA3AF;">${String(i + 1).padStart(2, '0')}</td>
            <td><span class="ref-id">${paymentId.slice(0, 20)}${paymentId.length > 20 ? '...' : ''}</span></td>
            <td class="student-name">${t.student_name || t.studentName || 'Unregistered'}</td>
            <td class="align-right" style="font-weight: 700;">₹${(t.amount || 0).toLocaleString('en-IN')}</td>
            <td style="color: #4B5563;">${t.method || 'Internal'}</td>
            <td><span class="status-pill status-${(t.status || 'pending').toLowerCase()}">${t.status || 'Settled'}</span></td>
            <td class="align-right" style="color: #6B7280;">${dateFormatted}</td>
          </tr>
        `;
    }).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div>ADTU Integrated Transport Management System (ITMS)</div>
    <div>Report Stamp: ${new Date().toISOString()}</div>
    <div style="font-weight: 700;">UNIFIED FINANCIAL REGISTER</div>
  </div>
</body>
</html>
    `;

    // 9. Generate PDF with Puppeteer
    let pdfBuffer: Buffer | null = null;
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
      });
      const page = await browser.newPage();

      // Institutional PDF generation with automatic pagination
      await page.setContent(pdfHTML, { waitUntil: 'networkidle0' });
      pdfBuffer = Buffer.from(await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '20mm', right: '15mm', bottom: '25mm', left: '15mm' }
      }));
      await browser.close();
      console.log("✅ Institutional PDF generated successfully");
    } catch (pdfError: any) {
      console.error("❌ PDF generation failed:", pdfError.message);
    }

    // 10. Create Gmail transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: ADMIN_EMAIL,
        pass: GMAIL_PASS,
      },
    });

    // 11. Verify SMTP connection
    await transporter.verify();
    console.log("✅ SMTP connection verified");

    /**
     * NOTE ON FROM/TO ADDRESSES:
     * -------------------------
     * Currently, the 'from' is set as: `"noreply@adtu-transport-services.com" <${GMAIL_USER}>`
     * and the 'to' is set as: `ADMIN_EMAIL`
     * 
     * To change the sender name/email:
     * - You can change the string in the 'from' field below.
     * - Note: Gmail SMTP often forces the actual email into the authenticated user (GMAIL_USER),
     *   but the display name (the part in quotes) will still show correctly!
     */
    const attachments: any[] = [];
    if (pdfBuffer) {
      const dateSlug = new Date().toISOString().split('T')[0].replace(/-/g, '');
      attachments.push({
        filename: `ADTU_Transaction_Report_${dateSlug}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    const info = await transporter.sendMail({
      from: `"noreply@adtu-transport-services.com" <${ADMIN_EMAIL}>`,
      to: ADMIN_EMAIL,                            // <--- This is the recipient email
      replyTo: "noreply@adtu.ac.in",
      subject: `📊 Transaction Report – ${dateStr} | ADTU Bus Services`,
      html: emailHTML,
      attachments,
    });

    console.log("✅ Premium Email sent:", info.messageId);

    // 12. Success response
    return NextResponse.json({
      success: true,
      message: `Email sent to ${ADMIN_EMAIL}`,
      messageId: info.messageId,
      transactionCount: transactions.length,
      hasRealData,
      totalAmount,
      hasPdfAttachment: !!pdfBuffer,
    });

  } catch (error: any) {
    console.error("❌ Email error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to send email",
        code: error.code || error.responseCode || "UNKNOWN",
        hint: "Check Node.js runtime, Gmail App Password, and Puppeteer installation.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   GET: Configuration check
   ============================================================ */
export async function GET() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const gmailPass = process.env.GMAIL_PASS;

  const maskEmail = (email: string | undefined) => {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!domain) return email.slice(0, 5) + "***";
    return local.slice(0, Math.min(local.length, 8)) + "***@" + domain;
  };

  return NextResponse.json({
    configured: Boolean(adminEmail && gmailPass),
    adminEmail: maskEmail(adminEmail),
    hasGmailPass: Boolean(gmailPass && gmailPass.length >= 16),
    passLength: gmailPass?.length || 0,
    supabaseReady: paymentsSupabaseService.isReady(),
  });
}
