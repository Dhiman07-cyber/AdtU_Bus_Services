/**
 * Annual Payment Export API (SAFE VERSION - READ-ONLY)
 * 
 * ⚠️ CRITICAL ARCHITECTURE RULES:
 * 1. This API performs READ-ONLY operations on payment data.
 * 2. NO payment records are deleted from Supabase.
 * 3. NO payment data is archived to Firestore.
 * 4. Supabase `payments` table is the SINGLE SOURCE OF TRUTH.
 * 
 * WHAT THIS API DOES:
 * 1. Reads payment data from Supabase for the configured date range
 * 2. Generates CSV/PDF report
 * 3. Emails the report to admin
 * 4. Optionally uploads to Supabase Storage
 * 5. Records export in payment_exports table (audit trail)
 * 
 * WHAT THIS API DOES NOT DO:
 * ❌ Delete payment records
 * ❌ Archive payments to Firestore
 * ❌ Migrate or move payment data
 * ❌ "Clean up" payments after export
 * 
 * Triggered by: Cloud Scheduler / Vercel Cron / Manual
 * Schedule: As needed for reporting (e.g., end of financial year)
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ADMIN_EMAIL
 *   - GMAIL_USER
 *   - GMAIL_PASS
 */

export const runtime = "nodejs";
export const maxDuration = 120;

import nodemailer from "nodemailer";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

/* ============================================================
   GET: Trigger Annual Export (SAFE - READ ONLY)
   ============================================================ */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Read environment variables
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_PASS = process.env.GMAIL_PASS;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 2. Validate environment variables
    const missing: string[] = [];
    if (!ADMIN_EMAIL) missing.push("ADMIN_EMAIL");
    if (!GMAIL_USER) missing.push("GMAIL_USER");
    if (!GMAIL_PASS) missing.push("GMAIL_PASS");
    if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!SUPABASE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

    if (missing.length > 0) {
      console.error("❌ Missing env vars:", missing);
      return NextResponse.json(
        { success: false, error: `Missing: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // 3. Parse query parameters
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');
    const startYearParam = url.searchParams.get('startYear');
    const endYearParam = url.searchParams.get('endYear');

    // 4. Calculate date range
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let academicStartYear: number;
    let academicEndYear: number;

    if (startYearParam && endYearParam) {
      // Custom date range specified
      academicStartYear = parseInt(startYearParam);
      academicEndYear = parseInt(endYearParam);
    } else if (yearParam) {
      // Single year specified (e.g., ?year=2024 for FY 2024-2025)
      academicStartYear = parseInt(yearParam);
      academicEndYear = academicStartYear + 1;
    } else {
      // Default: current/previous academic year (April-March)
      academicStartYear = currentMonth < 3 ? currentYear - 1 : currentYear;
      academicEndYear = academicStartYear + 1;
    }

    const startDate = new Date(`${academicStartYear}-04-01T00:00:00.000Z`);
    const endDate = new Date(`${academicEndYear}-03-31T23:59:59.999Z`);
    const financialYear = `${academicStartYear}-${academicEndYear}`;

    console.log(`📊 Annual Export: FY ${financialYear}`);
    console.log(`   Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // 5. Load ADTU Logo for PDF
    let logoSvg = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "adtu-new-logo.svg");
      if (fs.existsSync(logoPath)) {
        logoSvg = fs.readFileSync(logoPath, "utf8");
      }
    } catch (err) {
      console.warn("⚠️ Could not load logo SVG:", err);
    }

    // 6. Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false }
    });

    // 7. Fetch payments from Supabase (READ-ONLY)
    console.log("📥 Fetching payments from Supabase...");
    const { data: transactions, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .gte("transaction_date", startDate.toISOString())
      .lte("transaction_date", endDate.toISOString())
      .order("transaction_date", { ascending: false });

    if (fetchError) {
      console.error("❌ Supabase fetch error:", fetchError);
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      );
    }

    const hasRealData = transactions && transactions.length > 0;
    const paymentData = transactions || [];

    console.log(`✅ Found ${paymentData.length} payment records`);

    // 8. Calculate summary statistics
    const totalAmount = paymentData.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const completedCount = paymentData.filter(t => t.status === "Completed").length;
    const pendingCount = paymentData.filter(t => t.status === "Pending").length;

    const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const reportId = `ADTU-EXP-${academicEndYear}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 9. Build Email HTML
    const emailHTML = buildEmailHTML({
      financialYear,
      dateStr,
      hasRealData,
      paymentData,
      totalAmount,
      completedCount,
      pendingCount,
      reportId,
      ADMIN_EMAIL: ADMIN_EMAIL!,
    });

    // 10. Build PDF HTML
    const pdfHTML = buildPdfHTML({
      logoSvg,
      reportId,
      financialYear,
      dateStr,
      paymentData,
      totalAmount,
      completedCount,
    });

    // 11. Generate PDF with Puppeteer
    console.log("📄 Generating PDF report...");
    let pdfBuffer: Buffer | null = null;

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setContent(pdfHTML, { waitUntil: 'networkidle0' });
      pdfBuffer = Buffer.from(await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '20mm', right: '15mm', bottom: '25mm', left: '15mm' }
      }));
      await browser.close();
      console.log("✅ PDF generated successfully");
    } catch (pdfError: any) {
      console.error("❌ PDF generation failed:", pdfError.message);
    }

    // 12. Create Gmail transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS,
      },
    });

    // 13. Verify SMTP connection
    await transporter.verify();
    console.log("✅ SMTP connection verified");

    // 14. Prepare PDF attachment
    const attachments: any[] = [];
    if (pdfBuffer) {
      attachments.push({
        filename: `ADTU_Payment_Report_FY${financialYear}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    // 15. Send email
    const info = await transporter.sendMail({
      from: `"noreply@adtu-transport-services.com" <${GMAIL_USER}>`,
      to: ADMIN_EMAIL,
      replyTo: "noreply@adtu.ac.in",
      subject: `📊 Payment Export – FY ${financialYear} | ADTU Bus Services`,
      html: emailHTML,
      attachments,
    });

    const emailSent = !!info.messageId;
    console.log(`✅ Export email sent: ${info.messageId}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 16. Log export to Supabase (audit trail ONLY - no data modification)
    let exportLogId = null;
    try {
      const { data: logData } = await supabase.from("payment_exports").insert({
        export_id: reportId,
        academic_year: financialYear,
        total_records: paymentData.length,
        total_amount: totalAmount,
        exported_by: "cron",
        status: "completed",
        meta: {
          completedCount,
          pendingCount,
          hasPdf: !!pdfBuffer,
          duration: `${duration}s`,
          sentTo: ADMIN_EMAIL,
          // NOTE: No cleanup or archival - this is a READ-ONLY export
          safeExport: true,
          paymentsPreserved: true,
        }
      }).select('id').single();
      exportLogId = logData?.id;
      console.log("📝 Export logged to payment_exports table");
    } catch (logError) {
      console.warn("⚠️ Could not log export:", logError);
    }

    // 17. Success response
    return NextResponse.json({
      success: true,
      message: `Annual export sent to ${ADMIN_EMAIL}`,
      reportId,
      financialYear,
      transactionCount: paymentData.length,
      totalAmount,
      completedCount,
      pendingCount,
      hasPdf: !!pdfBuffer,
      duration: `${duration}s`,
      emailSent,
      // IMPORTANT: No cleanup/archival was performed
      cleanup: {
        requested: false,
        deleted: 0,
        success: false,
        message: "Cleanup is DISABLED. Payments are permanent financial records.",
      },
      archival: {
        performed: false,
        message: "Firestore archival is DISABLED. Supabase is the single source of truth.",
      },
    });

  } catch (error: any) {
    console.error("❌ Annual export error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process annual export",
        code: error.code || "UNKNOWN",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST: Manual Trigger with options
   ============================================================ */
export async function POST(request: NextRequest) {
  // Forward to GET handler
  return GET(request);
}

/* ============================================================
   HELPER: Build Email HTML
   ============================================================ */
function buildEmailHTML(params: {
  financialYear: string;
  dateStr: string;
  hasRealData: boolean;
  paymentData: any[];
  totalAmount: number;
  completedCount: number;
  pendingCount: number;
  reportId: string;
  ADMIN_EMAIL: string;
}): string {
  const { financialYear, dateStr, hasRealData, paymentData, totalAmount, completedCount, pendingCount, reportId, ADMIN_EMAIL } = params;

  return `
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
            <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:4px;text-transform:uppercase;letter-spacing:2px;">Annual Financial Report</div>
          </div>
          <div style="margin-top:20px;">
            <span style="background:${hasRealData ? '#22c55e' : '#f59e0b'};color:#fff;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.2);">
              ${hasRealData ? '● OFFICIAL DATA' : '⚠ NO DATA FOUND'}
            </span>
            <span style="background:#10b981;color:#fff;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px;">
              ● READ-ONLY EXPORT
            </span>
          </div>
        </td>
      </tr>

      <!-- Message Area -->
      <tr>
        <td style="padding:30px 30px 0;text-align:center;">
          <h2 style="margin:0;font-size:20px;color:#fff;">Annual Payment Export</h2>
          <p style="color:#94a3b8;font-size:14px;margin-top:8px;">Financial Year ${financialYear} &middot; Generated on ${dateStr}</p>
        </td>
      </tr>

      <!-- KPI Cards -->
      <tr>
        <td style="padding:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33.33%" align="center" style="padding:8px;">
                <div style="background:#0f172a;border-radius:16px;padding:20px 10px;border:1px solid #334155;">
                  <div style="font-size:28px;font-weight:700;color:#fff;">${paymentData.length}</div>
                  <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;">Volume</div>
                </div>
              </td>
              <td width="33.33%" align="center" style="padding:8px;">
                <div style="background:#0f172a;border-radius:16px;padding:20px 10px;border:1px solid #334155;">
                  <div style="font-size:28px;font-weight:700;color:#4ade80;">₹${totalAmount >= 100000 ? (totalAmount / 100000).toFixed(1) + 'L' : (totalAmount / 1000).toFixed(1) + 'k'}</div>
                  <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;">Revenue</div>
                </div>
              </td>
              <td width="33.33%" align="center" style="padding:8px;">
                <div style="background:#0f172a;border-radius:16px;padding:20px 10px;border:1px solid #334155;">
                  <div style="font-size:28px;font-weight:700;color:#818cf8;">${completedCount}</div>
                  <div style="color:#64748b;font-size:11px;margin-top:4px;text-transform:uppercase;">Completed</div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Info Section -->
      <tr>
        <td style="padding:0 24px 30px;">
          <div style="background:#0f172a;border-radius:20px;padding:24px;border:1px solid #334155;background:linear-gradient(to bottom, #0f172a, #1e293b);">
            <div style="display:flex;align-items:center;margin-bottom:16px;">
              <div style="font-size:20px;margin-right:12px;">📄</div>
              <div>
                <div style="font-size:14px;font-weight:600;color:#fff;">PDF Report Attached</div>
                <div style="font-size:12px;color:#94a3b8;">Complete transaction register for FY ${financialYear}</div>
              </div>
            </div>
            
            <div style="height:1px;background:#334155;margin:16px 0;"></div>
            
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#94a3b8;">
              <tr>
                <td style="padding:4px 0;"><strong>Report Type:</strong></td>
                <td style="padding:4px 0;text-align:right;"><span style="color:#f472b6;">Annual Export (Safe)</span></td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>Recipient:</strong></td>
                <td style="padding:4px 0;text-align:right;"><span style="color:#4ade80;">${ADMIN_EMAIL}</span></td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>System ID:</strong></td>
                <td style="padding:4px 0;text-align:right;color:#fff;">${reportId}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>Pending:</strong></td>
                <td style="padding:4px 0;text-align:right;color:#fbbf24;">${pendingCount}</td>
              </tr>
            </table>
          </div>
        </td>
      </tr>

      <!-- Safety Notice -->
      <tr>
        <td style="padding:0 24px 30px;">
          <div style="background:#14532d;border-radius:16px;padding:16px;border:1px solid #22c55e;">
            <div style="font-size:14px;font-weight:600;color:#fff;">
              ✓ Payments Preserved
            </div>
            <div style="font-size:12px;color:#6ee7b7;margin-top:4px;">
              This is a READ-ONLY export. No payment records were deleted or archived.
            </div>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#020617;padding:30px;text-align:center;border-top:1px solid #334155;">
          <div style="color:#64748b;font-size:12px;letter-spacing:0.5px;">Automated export from Assam down town University Transport Wing.</div>
          <div style="color:#475569;font-size:11px;margin-top:8px;">Confidential &middot; FY ${financialYear}</div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>
    `;
}

/* ============================================================
   HELPER: Build PDF HTML
   ============================================================ */
function buildPdfHTML(params: {
  logoSvg: string;
  reportId: string;
  financialYear: string;
  dateStr: string;
  paymentData: any[];
  totalAmount: number;
  completedCount: number;
}): string {
  const { logoSvg, reportId, financialYear, dateStr, paymentData, totalAmount, completedCount } = params;

  return `
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
    
    .meta { text-align: right; }
    .meta-item { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .meta-value { font-size: 11px; font-weight: 700; color: #111827; margin-bottom: 10px; }

    .report-header { margin-bottom: 30px; }
    .report-title-container { display: flex; align-items: center; gap: 12px; }
    .report-title { font-size: 24px; font-weight: 700; color: #111827; margin: 0; letter-spacing: -0.02em; }
    .status-badge { 
      background: #DCFCE7; 
      color: #166534; 
      padding: 4px 12px; 
      border-radius: 6px; 
      font-size: 11px; 
      font-weight: 700; 
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .report-subtitle { font-size: 14px; color: #6B7280; margin-top: 6px; }

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
    .student-id { font-weight: 600; font-size: 12.5px; }
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
    
    .no-data {
      text-align: center;
      padding: 60px 40px;
      color: #6B7280;
    }
    .no-data-icon { font-size: 48px; margin-bottom: 16px; }
    .no-data-title { font-size: 18px; font-weight: 600; color: #374151; }
    .no-data-desc { font-size: 14px; margin-top: 8px; }
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
      <div class="meta-item">Financial Year</div>
      <div class="meta-value">${financialYear}</div>
      <div class="meta-item">Export Date</div>
      <div class="meta-value">${dateStr}</div>
    </div>
  </div>

  <div class="report-header">
    <div class="report-title-container">
      <h1 class="report-title">Annual Payment Register</h1>
      <span class="status-badge">Safe Export</span>
    </div>
    <p class="report-subtitle">Complete financial transaction records for FY ${financialYear}, exported on ${dateStr}. Payments preserved in database.</p>
  </div>

  <div class="kpi-strip">
    <div class="kpi-card">
      <div class="kpi-label">Total Volume</div>
      <div class="kpi-value">${paymentData.length} Records</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gross Revenue</div>
      <div class="kpi-value money">₹${totalAmount.toLocaleString('en-IN')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Completion Rate</div>
      <div class="kpi-value">${paymentData.length > 0 ? Math.round((completedCount / paymentData.length) * 100) : 0}%</div>
    </div>
  </div>

  ${paymentData.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th width="30">#</th>
        <th>Reference ID</th>
        <th>Student ID</th>
        <th class="align-right">Amount</th>
        <th>Payment Type</th>
        <th>Status</th>
        <th class="align-right">Date</th>
      </tr>
    </thead>
    <tbody>
      ${paymentData.map((t: any, i: number) => {
    const paymentId = t.payment_id || t.paymentId || "N/A";
    const date = t.transaction_date || t.created_at;
    const dateFormatted = date ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A";
    return `
          <tr>
            <td style="color: #9CA3AF;">${String(i + 1).padStart(3, '0')}</td>
            <td><span class="ref-id">${paymentId.slice(0, 20)}${paymentId.length > 20 ? '...' : ''}</span></td>
            <td class="student-id">${t.student_id || 'N/A'}</td>
            <td class="align-right" style="font-weight: 700;">₹${(parseFloat(t.amount) || 0).toLocaleString('en-IN')}</td>
            <td style="color: #4B5563;">${t.method || 'N/A'}</td>
            <td><span class="status-pill status-${(t.status || 'pending').toLowerCase()}">${t.status || 'Pending'}</span></td>
            <td class="align-right" style="color: #6B7280;">${dateFormatted}</td>
          </tr>
        `;
  }).join('')}
    </tbody>
  </table>
  ` : `
  <div class="no-data">
    <div class="no-data-icon">📭</div>
    <div class="no-data-title">No Transactions Found</div>
    <div class="no-data-desc">No payment records exist for FY ${financialYear}.</div>
  </div>
  `}

  <div class="footer">
    <div>ADTU Integrated Transport Management System (ITMS)</div>
    <div>Report Stamp: ${new Date().toISOString()}</div>
    <div style="font-weight: 700;">ANNUAL FINANCIAL REGISTER (READ-ONLY EXPORT)</div>
  </div>
</body>
</html>
    `;
}
