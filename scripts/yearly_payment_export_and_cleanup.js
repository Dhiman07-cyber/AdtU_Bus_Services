/**
 * yearly_payment_export.js (SAFE VERSION - READ ONLY)
 * 
 * ⚠️ CRITICAL ARCHITECTURE RULES:
 * 1. This script performs READ-ONLY operations on payment data.
 * 2. NO payment records are ever deleted from Supabase.
 * 3. Supabase `payments` table is the SINGLE SOURCE OF TRUTH.
 * 4. Payments are PERMANENT financial records (5-10+ years).
 * 
 * WHAT THIS SCRIPT DOES:
 *   1. Reads payment data from Supabase for the specified academic year
 *   2. Generates a CSV file with payment records
 *   3. Emails the CSV to admin (if configured)
 *   4. Optionally uploads CSV to Supabase Storage
 * 
 * WHAT THIS SCRIPT DOES NOT DO:
 *   ❌ Delete payment records (--cleanup flag is IGNORED)
 *   ❌ Archive payments to Firestore
 *   ❌ Migrate or move payment data
 * 
 * Usage:
 *   DRY RUN:      node scripts/yearly_payment_export.js --dry
 *   EXPORT:       node scripts/yearly_payment_export.js
 *   SPECIFIC YEAR: node scripts/yearly_payment_export.js --year=2024
 *   CUSTOM RANGE: node scripts/yearly_payment_export.js --start=2021 --end=2025
 *   
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ADMIN_EMAIL (optional, for email)
 *   - GMAIL_USER (optional, for email)
 *   - GMAIL_PASS (optional, for email)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Parser } = require('json2csv');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry');

// --cleanup flag is IGNORED for safety
if (args.includes('--cleanup')) {
    console.log('\n⚠️  WARNING: --cleanup flag is IGNORED');
    console.log('    Payment deletion has been PERMANENTLY DISABLED.');
    console.log('    Payments are immutable financial records.\n');
}

const yearArg = args.find(arg => arg.startsWith('--year='));
const startArg = args.find(arg => arg.startsWith('--start='));
const endArg = args.find(arg => arg.startsWith('--end='));

const specificYear = yearArg ? parseInt(yearArg.split('=')[1]) : null;
const customStartYear = startArg ? parseInt(startArg.split('=')[1]) : null;
const customEndYear = endArg ? parseInt(endArg.split('=')[1]) : null;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60));
}

// Validate environment
function validateEnv() {
    const required = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
    ];

    // Optional for email
    const emailVars = ['ADMIN_EMAIL', 'GMAIL_USER', 'GMAIL_PASS'];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        log(`❌ Missing required environment variables:`, 'red');
        missing.forEach(key => log(`   - ${key}`, 'red'));
        process.exit(1);
    }

    const missingEmail = emailVars.filter(key => !process.env[key]);
    if (missingEmail.length > 0) {
        log(`⚠️ Missing email configuration - email functionality disabled:`, 'yellow');
        missingEmail.forEach(key => log(`   - ${key}`, 'yellow'));
        return false;
    }

    return true;
}

// Initialize Supabase
function initSupabase() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
    log('✅ Supabase client initialized', 'green');
    return supabase;
}

// Get academic year range (April 1 to March 31)
function getAcademicYearRange(startYear, endYear) {
    const start = new Date(`${startYear}-04-01T00:00:00.000Z`);
    const end = new Date(`${endYear}-03-31T23:59:59.999Z`);

    return {
        startYear,
        endYear,
        start,
        end,
        label: `${startYear}-${endYear}`,
    };
}

// Fetch payments (READ-ONLY)
async function fetchPayments(supabase, yearRange) {
    logSection(`📦 FETCHING PAYMENTS FOR ${yearRange.label}`);

    log(`Date range: ${yearRange.start.toISOString()} to ${yearRange.end.toISOString()}`, 'blue');

    const { data, error, count } = await supabase
        .from('payments')
        .select('*', { count: 'exact' })
        .gte('transaction_date', yearRange.start.toISOString())
        .lte('transaction_date', yearRange.end.toISOString())
        .order('transaction_date', { ascending: true });

    if (error) {
        log(`❌ Error fetching payments: ${error.message}`, 'red');
        throw error;
    }

    log(`✅ Found ${data.length} payment records (READ-ONLY)`, 'green');

    if (data.length === 0) {
        log('No payments found for this period', 'yellow');
        return { rows: [], count: 0, totalAmount: 0, stats: { completedCount: 0, pendingCount: 0 } };
    }

    // Calculate totals
    const totalAmount = data.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const completedCount = data.filter(p => p.status === 'Completed').length;
    const pendingCount = data.filter(p => p.status === 'Pending').length;

    log(`Total amount: ₹${totalAmount.toLocaleString('en-IN')}`, 'blue');
    log(`Completed: ${completedCount}, Pending: ${pendingCount}`, 'blue');

    return {
        rows: data,
        count: data.length,
        totalAmount,
        stats: { completedCount, pendingCount }
    };
}

// Generate CSV from payment data
async function generateCsv(rows, yearRange) {
    logSection('📄 GENERATING CSV');

    if (rows.length === 0) {
        log('No rows to export', 'yellow');
        return null;
    }

    // Define CSV fields
    const fields = [
        { label: 'Payment ID', value: 'payment_id' },
        { label: 'Student ID', value: 'student_id' },
        { label: 'Student UID', value: 'student_uid' },
        { label: 'Amount (INR)', value: 'amount' },
        { label: 'Method', value: 'method' },
        { label: 'Status', value: 'status' },
        { label: 'Session Start', value: 'session_start_year' },
        { label: 'Session End', value: 'session_end_year' },
        { label: 'Duration (Years)', value: 'duration_years' },
        { label: 'Valid Until', value: 'valid_until' },
        { label: 'Transaction Date', value: 'transaction_date' },
        { label: 'Razorpay ID', value: 'razorpay_payment_id' },
        { label: 'Offline Txn ID', value: 'offline_transaction_id' },
        { label: 'Approved At', value: 'approved_at' },
        { label: 'Created At', value: 'created_at' },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    // Write to temp file
    const fileName = `payments_export_${yearRange.label}_${Date.now()}.csv`;
    const filePath = path.join(process.env.TEMP || '/tmp', fileName);

    await fs.writeFile(filePath, csv, 'utf8');

    const stats = await fs.stat(filePath);
    log(`✅ CSV generated: ${fileName}`, 'green');
    log(`   Path: ${filePath}`, 'reset');
    log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`, 'reset');
    log(`   Records: ${rows.length}`, 'reset');

    return { filePath, fileName, csv, size: stats.size };
}

// Send email with CSV attachment
async function sendEmail(csvInfo, yearRange, stats) {
    logSection('📧 SENDING EMAIL');

    if (!process.env.ADMIN_EMAIL || !process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
        log('⚠️ Email configuration missing - skipping email', 'yellow');
        return null;
    }

    if (isDryRun) {
        log(`[DRY RUN] Would send email to: ${process.env.ADMIN_EMAIL}`, 'yellow');
        return { messageId: 'dry-run' };
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
    });

    const emailBody = `
ADTU Bus Services - Payment Export Report (SAFE EXPORT)
========================================================

Academic Year: ${yearRange.label}
Export Date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Summary:
- Total Records: ${stats.count}
- Total Amount: ₹${stats.totalAmount.toLocaleString('en-IN')}
- Completed Payments: ${stats.stats.completedCount}
- Pending Payments: ${stats.stats.pendingCount}

The attached CSV contains all payment records for the specified period.

⚠️ IMPORTANT: This is a READ-ONLY export.
No payment records were deleted or archived.
Payments remain permanently stored in Supabase.

This is an automated email. Please do not reply.

--
ADTU Bus Services System
    `.trim();

    const mailOptions = {
        from: `ADTU Bus Services <${process.env.GMAIL_USER}>`,
        to: process.env.ADMIN_EMAIL,
        subject: `[ADTU Bus] Payment Export ${yearRange.label} (Safe Export)`,
        text: emailBody,
        attachments: [
            {
                filename: csvInfo.fileName,
                path: csvInfo.filePath,
            },
        ],
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        log(`✅ Email sent: ${info.messageId}`, 'green');
        log(`   To: ${process.env.ADMIN_EMAIL}`, 'reset');
        return info;
    } catch (err) {
        log(`❌ Email failed: ${err.message}`, 'red');
        throw err;
    }
}

// Archive CSV to Supabase Storage
async function archiveCsv(supabase, csvInfo, yearRange) {
    logSection('📁 ARCHIVING TO SUPABASE STORAGE');

    if (isDryRun) {
        log('[DRY RUN] Would upload to Supabase Storage', 'yellow');
        return { path: 'dry-run' };
    }

    try {
        const fileBuffer = await fs.readFile(csvInfo.filePath);
        const storagePath = `payment-exports/${csvInfo.fileName}`;

        const { data, error } = await supabase.storage
            .from('exports')
            .upload(storagePath, fileBuffer, {
                contentType: 'text/csv',
                upsert: true,
            });

        if (error) {
            // If bucket doesn't exist, try to create it
            if (error.message.includes('not found') || error.statusCode === 404) {
                log('Creating exports bucket...', 'yellow');
                await supabase.storage.createBucket('exports', {
                    public: false,
                    fileSizeLimit: 52428800, // 50MB
                });

                // Retry upload
                const { data: retryData, error: retryError } = await supabase.storage
                    .from('exports')
                    .upload(storagePath, fileBuffer, {
                        contentType: 'text/csv',
                        upsert: true,
                    });

                if (retryError) throw retryError;
                log(`✅ Archived to: ${storagePath}`, 'green');
                return retryData;
            }
            throw error;
        }

        log(`✅ Archived to: ${storagePath}`, 'green');
        return data;
    } catch (err) {
        log(`⚠️ Archive failed: ${err.message}`, 'yellow');
        log('Continuing without archive...', 'yellow');
        return null;
    }
}

// Record export in payment_exports table
async function recordExport(supabase, yearRange, stats, archiveResult) {
    logSection('📝 RECORDING EXPORT');

    if (isDryRun) {
        log('[DRY RUN] Would record export metadata', 'yellow');
        return { id: 'dry-run' };
    }

    const exportId = `export_${yearRange.label}_${Date.now()}`;

    const { data, error } = await supabase
        .from('payment_exports')
        .upsert([{
            export_id: exportId,
            academic_year: yearRange.label,
            file_name: `payments_export_${yearRange.label}.csv`,
            file_path: archiveResult?.path || null,
            total_records: stats.count,
            total_amount: stats.totalAmount,
            exported_by: 'cli',
            status: 'completed',
            meta: {
                completedCount: stats.stats.completedCount,
                pendingCount: stats.stats.pendingCount,
                exportedAt: new Date().toISOString(),
                safeExport: true,           // Indicates no deletion was performed
                paymentsPreserved: true,    // Payments remain in database
            },
        }], { onConflict: 'export_id' });

    if (error) {
        log(`⚠️ Failed to record export: ${error.message}`, 'yellow');
        return null;
    }

    log(`✅ Export recorded: ${exportId}`, 'green');
    return { exportId };
}

// Cleanup temp file
async function cleanupTempFile(filePath) {
    try {
        await fs.unlink(filePath);
        log(`🧹 Cleaned up temp file: ${filePath}`, 'reset');
    } catch {
        // Ignore cleanup errors
    }
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('\n' + '='.repeat(60));
    log('💳 PAYMENT EXPORT (SAFE - READ ONLY)', 'bright');
    console.log('='.repeat(60));

    // Show that cleanup is disabled
    console.log('\n' + '-'.repeat(40));
    log('🔒 SAFETY MODE: Payment deletion is DISABLED', 'green');
    log('   Payments are permanent financial records.', 'reset');
    log('   This export is READ-ONLY.', 'reset');
    console.log('-'.repeat(40));

    log(`\nOptions:`, 'cyan');
    log(`  Dry Run: ${isDryRun}`, isDryRun ? 'yellow' : 'reset');

    // Calculate year range
    let startYear, endYear;
    if (customStartYear && customEndYear) {
        startYear = customStartYear;
        endYear = customEndYear;
    } else if (specificYear) {
        startYear = specificYear;
        endYear = specificYear + 1;
    } else {
        // Default: previous academic year
        const now = new Date();
        startYear = now.getMonth() < 3 ? now.getFullYear() - 2 : now.getFullYear() - 1;
        endYear = startYear + 1;
    }

    log(`  Year Range: ${startYear}-${endYear}`, 'reset');

    let csvFilePath = null;

    try {
        const emailEnabled = validateEnv();
        const supabase = initSupabase();
        const yearRange = getAcademicYearRange(startYear, endYear);

        log(`\nAcademic Year: ${yearRange.label}`, 'cyan');

        // Fetch payments (READ-ONLY)
        const { rows, count, totalAmount, stats } = await fetchPayments(supabase, yearRange);

        if (count === 0) {
            log('\n⚠️ No payments to export. Exiting.', 'yellow');
            return;
        }

        // Generate CSV
        const csvInfo = await generateCsv(rows, yearRange);
        if (csvInfo) {
            csvFilePath = csvInfo.filePath;

            // Send email
            if (emailEnabled) {
                await sendEmail(csvInfo, yearRange, { count, totalAmount, stats });
            }

            // Archive to storage
            const archiveResult = await archiveCsv(supabase, csvInfo, yearRange);

            // Record export
            await recordExport(supabase, yearRange, { count, totalAmount, stats }, archiveResult);
        }

        // Summary
        logSection('📊 SUMMARY');
        console.log({
            academicYear: yearRange.label,
            exported: count,
            totalAmount: `₹${totalAmount.toLocaleString('en-IN')}`,
            emailSent: emailEnabled ? !isDryRun : false,
            archived: !isDryRun,
            // NO DELETION - payments are preserved
            paymentsDeleted: 0,
            paymentsPreserved: true,
            isDryRun,
        });

        log('\n✅ Export completed successfully!', 'green');
        log('   💾 All payments remain in Supabase (immutable ledger)', 'blue');

        if (isDryRun) {
            log('\n⚠️ This was a DRY RUN. No files were uploaded.', 'yellow');
        }

    } catch (error) {
        log(`\n❌ Export failed: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    } finally {
        // Cleanup temp file
        if (csvFilePath) {
            await cleanupTempFile(csvFilePath);
        }
    }
}

main();
