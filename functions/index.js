/**
 * Firebase Cloud Functions for ADTU Bus Service
 * 
 * This module exports Firebase Cloud Functions including:
 * - getFirestoreHealth: Fetches Firestore system metrics using Google Cloud Monitoring API
 * - processDeadlines: Daily scheduled function for deadline enforcement (soft blocks, hard deletes)
 */

import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { MetricServiceClient } from "@google-cloud/monitoring";
import admin from "firebase-admin";
import cors from "cors";
import { FieldValue } from "firebase-admin/firestore";

// ============================================
// INITIALIZE FIREBASE ADMIN SDK
// ============================================
// Initialize Firebase Admin SDK
// For local emulator: Uses Application Default Credentials (no .env needed!)
// For production: Uses environment variables
if (!admin.apps.length) {
  try {
    // Try to use environment variables first (production)
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      console.log("📦 Initializing with environment credentials...");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "adtu-bus-xq",
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else {
      // Fallback to Application Default Credentials (works in emulator!)
      console.log("🔧 No credentials in .env - using Application Default Credentials (local mode)");
      admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "adtu-bus-xq"
      });
    }
    console.log("✅ Firebase Admin initialized successfully!");
  } catch (error) {
    console.error("❌ Firebase Admin initialization error:", error.message);
    // Initialize with minimal config as fallback
    admin.initializeApp({
      projectId: "adtu-bus-xq"
    });
  }
}

// Initialize CORS middleware
const corsHandler = cors({ origin: true });

// ============================================
// HELPER: FETCH METRIC FROM GOOGLE CLOUD MONITORING
// ============================================
/**
 * Fetches a specific metric from Google Cloud Monitoring API
 * 
 * @param {MetricServiceClient} client - Monitoring API client
 * @param {string} projectId - GCP project ID
 * @param {string} metricType - Metric type (e.g., 'firestore.googleapis.com/storage/bytes_used')
 * @param {number} hoursAgo - Number of hours to look back (default: 24)
 * @returns {Promise<number>} - Metric value or 0 if not found
 */
async function fetchMetric(client, projectId, metricType, hoursAgo = 24) {
  try {
    // Calculate time range (last N hours)
    const now = Date.now();
    const endTime = {
      seconds: Math.floor(now / 1000)
    };
    const startTime = {
      seconds: Math.floor((now - (hoursAgo * 60 * 60 * 1000)) / 1000)
    };

    // Build the time series request
    const request = {
      name: `projects/${projectId}`,
      filter: `metric.type = "${metricType}"`,
      interval: {
        startTime,
        endTime
      },
      // Aggregate data to get the latest value
      aggregation: {
        alignmentPeriod: {
          seconds: 3600 // 1 hour
        },
        perSeriesAligner: 'ALIGN_MEAN',
        crossSeriesReducer: 'REDUCE_SUM'
      }
    };

    // Fetch the time series data
    const [timeSeries] = await client.listTimeSeries(request);

    // Extract the latest value
    if (timeSeries && timeSeries.length > 0) {
      const points = timeSeries[0].points;
      if (points && points.length > 0) {
        // Get the most recent point
        const latestPoint = points[0];
        const value = latestPoint.value?.doubleValue ||
          latestPoint.value?.int64Value ||
          latestPoint.value?.distributionValue?.mean ||
          0;
        return parseFloat(value);
      }
    }

    return 0;
  } catch (error) {
    console.error(`Error fetching metric ${metricType}:`, error.message);
    return 0;
  }
}

// ============================================
// CLOUD FUNCTION: GET FIRESTORE HEALTH
// ============================================
/**
 * HTTPS Cloud Function: getFirestoreHealth
 * 
 * Fetches Firestore system metrics from Google Cloud Monitoring API.
 * 
 * Response Format:
 * {
 *   storageUsedMB: number,
 *   totalDocuments: number,
 *   readsLast24h: number,
 *   writesLast24h: number,
 *   deletesLast24h: number,
 *   updatedAt: string (ISO timestamp)
 * }
 * 
 * @example
 * GET https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/getFirestoreHealth
 */
export const getFirestoreHealth = onRequest(
  {
    // Configure function
    region: "asia-south1", // Change to your preferred region
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 60
  },
  async (req, res) => {
    // Handle CORS preflight
    return corsHandler(req, res, async () => {
      try {
        console.log("🔍 Fetching Firestore health metrics...");

        // Get project ID from environment
        const projectId = process.env.FIREBASE_PROJECT_ID ||
          process.env.GCLOUD_PROJECT ||
          "adtu-bus-xq";

        console.log(`📊 Project ID: ${projectId}`);

        // ============================================
        // INITIALIZE GOOGLE CLOUD MONITORING CLIENT
        // ============================================
        // Initialize Monitoring client with or without explicit credentials
        let monitoringClient;

        if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
          console.log("📦 Using environment credentials for Monitoring client");
          monitoringClient = new MetricServiceClient({
            credentials: {
              client_email: process.env.FIREBASE_CLIENT_EMAIL,
              private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            },
            projectId
          });
        } else {
          console.log("🔧 Using Application Default Credentials for Monitoring client");
          // Use Application Default Credentials (works in emulator!)
          monitoringClient = new MetricServiceClient({
            projectId
          });
        }

        // ============================================
        // FETCH FIRESTORE METRICS
        // ============================================
        console.log("📡 Fetching storage metrics...");

        // 1. Storage Used (bytes) - Convert to MB
        let storageBytes = await fetchMetric(
          monitoringClient,
          projectId,
          "firestore.googleapis.com/storage/bytes_used",
          1 // Last 1 hour for current value
        );

        let storageIsEstimated = false;

        // If Monitoring API returns 0, estimate from document count
        // (Monitoring API takes 24-48 hours to start collecting data)
        if (storageBytes === 0) {
          console.log("⚠️ No storage data from Monitoring API yet - using estimation");
          storageIsEstimated = true;
          // Rough estimate: average document size ~3-5 KB
          // More accurate: query actual documents
          const db = admin.firestore();
          try {
            // Try to get a more accurate count by querying main collections
            const mainCollections = ['students', 'drivers', 'buses', 'routes', 'applications',
              'driver_swap_requests', 'notifications', 'trip_notifications'];
            let estimatedDocs = 0;

            for (const collName of mainCollections) {
              try {
                const snapshot = await db.collection(collName).count().get();
                estimatedDocs += snapshot.data().count;
              } catch (err) {
                console.warn(`Could not count ${collName}:`, err.message);
              }
            }

            // Estimate: 4 KB average per document (conservative)
            storageBytes = estimatedDocs * 4 * 1024;
            console.log(`📊 Estimated storage from ${estimatedDocs} documents: ${storageBytes} bytes`);
          } catch (err) {
            console.warn("⚠️ Could not estimate storage:", err.message);
          }
        }

        const storageUsedMB = Math.round(storageBytes / (1024 * 1024) * 100) / 100;

        console.log("📡 Fetching document count...");

        // 2. Total Document Count - This is an estimate
        // Note: Firestore doesn't expose real-time document count via metrics
        // We'll try to get it from the database directly
        let totalDocuments = 0;
        try {
          const db = admin.firestore();
          // Get count from a few key collections as a sample
          const collections = await db.listCollections();
          console.log(`📚 Found ${collections.length} collections`);

          // For demo purposes, we'll count documents in main collections
          // In production, you might want to cache this or use a counter
          const mainCollections = ['students', 'drivers', 'buses', 'routes', 'applications'];
          for (const collName of mainCollections) {
            const snapshot = await db.collection(collName).count().get();
            totalDocuments += snapshot.data().count;
          }
        } catch (err) {
          console.warn("⚠️ Could not fetch document count:", err.message);
        }

        console.log("📡 Fetching read operations...");

        // 3. Read Operations (last 24 hours)
        const readsLast24h = Math.round(await fetchMetric(
          monitoringClient,
          projectId,
          "firestore.googleapis.com/document/read_count",
          24
        ));

        console.log("📡 Fetching write operations...");

        // 4. Write Operations (last 24 hours)
        const writesLast24h = Math.round(await fetchMetric(
          monitoringClient,
          projectId,
          "firestore.googleapis.com/document/write_count",
          24
        ));

        console.log("📡 Fetching delete operations...");

        // 5. Delete Operations (last 24 hours)
        const deletesLast24h = Math.round(await fetchMetric(
          monitoringClient,
          projectId,
          "firestore.googleapis.com/document/delete_count",
          24
        ));

        // ============================================
        // BUILD RESPONSE
        // ============================================
        const metrics = {
          storageUsedMB,
          totalDocuments,
          readsLast24h,
          writesLast24h,
          deletesLast24h,
          updatedAt: new Date().toISOString(),
          // Additional metadata
          projectId,
          status: "success",
          // Indicate if storage is estimated (Monitoring API needs 24-48h for new projects)
          storageIsEstimated,
          note: storageIsEstimated ? "Storage is estimated. Cloud Monitoring API needs 24-48 hours to collect actual data for new projects." : null
        };

        console.log("✅ Firestore health metrics fetched successfully:", metrics);

        // Return metrics as JSON
        res.status(200).json(metrics);

      } catch (error) {
        console.error("❌ Error fetching Firestore health:", error);

        // Return error response
        res.status(500).json({
          status: "error",
          error: error.message,
          details: "Failed to fetch Firestore health metrics. Check Cloud Function logs for details.",
          updatedAt: new Date().toISOString()
        });
      }
    });
  }
);

// ============================================
// SCHEDULED CLOUD FUNCTIONS: DATE-SPECIFIC CRON JOBS
// ============================================
/**
 * RENEWAL SYSTEM SCHEDULED FUNCTIONS
 * 
 * These functions run on SPECIFIC calendar dates (not daily) to minimize
 * cloud invocations and stay within free tier limits.
 * 
 * Each function is:
 * - Idempotent: Can run multiple times safely
 * - Batched: Processes students in batches of 500
 * - Storage-minimal: No Firestore audit logs, console only
 * - Simulation-aware: Respects testingMode flags
 * 
 * Schedule (all at 00:05 IST):
 * - July 1: Renewal deadline notification (renewalDeadline.month/day)
 * - July 31: Soft block enforcement (softBlock.month/day)
 * - Aug 16: Urgent warning (hardDelete - urgentWarningThreshold days)
 * - Aug 31: Hard delete enforcement (hardDelete.month/day in sessionEndYear+1)
 * 
 * NOTE: These are configured via Cloud Scheduler in the Firebase Console
 * or via deployment. The cron expressions below use example dates.
 */

/**
 * SOFT BLOCK ENFORCEMENT
 * Runs yearly on softBlock.month/day at 00:05 IST
 * 
 * Cron: "5 0 31 7 *" (July 31 at 00:05 - adjust based on config)
 */
export const enforceSoftBlock = onSchedule(
  {
    schedule: "5 0 31 7 *", // July 31 at 00:05 IST
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "256MiB",
    timeoutSeconds: 300,
    retryCount: 2
  },
  async (event) => {
    const db = admin.firestore();
    const runId = `softblock_${Date.now()}`;

    console.log(`[${runId}] 🔒 Starting Soft Block Enforcement...`);

    const stats = { processed: 0, blocked: 0, skipped: 0, errors: 0 };

    try {
      const config = await loadDeadlineConfig();
      const isSimulation = config.testingMode?.enabled ?? false;
      const canExecute = config.testingMode?.executeSimulationActions ?? false;

      // Get current year (or simulation year)
      const currentYear = isSimulation
        ? config.testingMode.customYear
        : new Date().getFullYear();

      console.log(`[${runId}] Year: ${currentYear}, Simulation: ${isSimulation}, Execute: ${canExecute}`);

      // Query students who should be soft blocked
      // Students with sessionEndYear === currentYear and status === 'active'
      const batchSize = 500;
      let lastDoc = null;

      while (true) {
        let query = db.collection('students')
          .where('sessionEndYear', '==', currentYear)
          .where('status', '==', 'active')
          .orderBy('__name__')
          .limit(batchSize);

        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        for (const doc of snapshot.docs) {
          const student = { id: doc.id, ...doc.data() };
          stats.processed++;

          // Skip if already blocked (idempotency)
          if (student.softBlockedAt) {
            stats.skipped++;
            continue;
          }

          if (isSimulation && !canExecute) {
            // Simulation: log only, no Firestore write
            console.log(`[${runId}][SIM] Would soft block: ${student.id} (${student.email || 'no email'})`);
            stats.blocked++;
            continue;
          }

          // Apply soft block
          try {
            await db.collection('students').doc(student.id).update({
              status: 'soft_blocked',
              softBlockedAt: FieldValue.serverTimestamp()
            });
            console.log(`[${runId}] ✅ Soft blocked: ${student.id}`);
            stats.blocked++;
          } catch (err) {
            console.error(`[${runId}] ❌ Error blocking ${student.id}:`, err.message);
            stats.errors++;
          }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }

      console.log(`[${runId}] 📊 Completed. Stats:`, JSON.stringify(stats));

    } catch (error) {
      console.error(`[${runId}] ❌ Fatal error:`, error);
      throw error;
    }
  }
);

/**
 * URGENT WARNING NOTIFICATION
 * Runs yearly ~15 days before hardDelete.month/day at 00:05 IST
 * 
 * Cron: "5 0 16 8 *" (Aug 16 at 00:05 - adjust based on config)
 */
export const sendUrgentWarnings = onSchedule(
  {
    schedule: "5 0 16 8 *", // Aug 16 at 00:05 IST (15 days before Aug 31)
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "256MiB",
    timeoutSeconds: 300,
    retryCount: 2
  },
  async (event) => {
    const db = admin.firestore();
    const runId = `urgentwarning_${Date.now()}`;

    console.log(`[${runId}] ⚠️ Starting Urgent Warning Notifications...`);

    const stats = { processed: 0, warned: 0, skipped: 0, errors: 0 };

    try {
      const config = await loadDeadlineConfig();
      const isSimulation = config.testingMode?.enabled ?? false;
      const canExecute = config.testingMode?.executeSimulationActions ?? false;

      // Get current year - for urgent warnings, we check sessionEndYear = currentYear - 1
      // because hard delete happens in sessionEndYear + 1
      const currentYear = isSimulation
        ? config.testingMode.customYear
        : new Date().getFullYear();
      const targetSessionEndYear = currentYear - 1;

      console.log(`[${runId}] Target sessionEndYear: ${targetSessionEndYear}`);

      // Query soft_blocked students from the previous academic year
      const batchSize = 500;
      let lastDoc = null;

      while (true) {
        let query = db.collection('students')
          .where('sessionEndYear', '==', targetSessionEndYear)
          .where('status', '==', 'soft_blocked')
          .orderBy('__name__')
          .limit(batchSize);

        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        for (const doc of snapshot.docs) {
          const student = { id: doc.id, ...doc.data() };
          stats.processed++;

          const daysRemaining = config.urgentWarningThreshold?.days || 15;

          if (isSimulation && !canExecute) {
            console.log(`[${runId}][SIM] Would warn: ${student.id} - ${daysRemaining} days left`);
            stats.warned++;
            continue;
          }

          // Create in-app notification (minimal - just notification doc)
          try {
            await db.collection('notifications').add({
              userId: student.uid || student.id,
              type: 'urgent_deletion_warning',
              title: `URGENT: Account deletion in ${daysRemaining} days`,
              message: 'Your account will be permanently deleted. Renew immediately.',
              read: false,
              priority: 'critical',
              createdAt: FieldValue.serverTimestamp()
            });
            console.log(`[${runId}] ✅ Warned: ${student.id}`);
            stats.warned++;
          } catch (err) {
            console.error(`[${runId}] ❌ Error warning ${student.id}:`, err.message);
            stats.errors++;
          }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }

      console.log(`[${runId}] 📊 Completed. Stats:`, JSON.stringify(stats));

    } catch (error) {
      console.error(`[${runId}] ❌ Fatal error:`, error);
      throw error;
    }
  }
);

/**
 * HARD DELETE ENFORCEMENT
 * Runs yearly on hardDelete.month/day at 00:05 IST
 * 
 * CRITICAL: This deletes in sessionEndYear + 1
 * For students with sessionEndYear=2025, deletion runs in 2026
 * 
 * Cron: "5 0 31 8 *" (Aug 31 at 00:05 - adjust based on config)
 */
export const enforceHardDelete = onSchedule(
  {
    schedule: "5 0 31 8 *", // Aug 31 at 00:05 IST
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "512MiB",
    timeoutSeconds: 540,
    retryCount: 1 // Only 1 retry for destructive operation
  },
  async (event) => {
    const db = admin.firestore();
    const runId = `harddelete_${Date.now()}`;

    console.log(`[${runId}] 🗑️ Starting Hard Delete Enforcement...`);
    console.log(`[${runId}] ⚠️ CRITICAL: This will permanently delete student data!`);

    const stats = { processed: 0, deleted: 0, skipped: 0, errors: 0 };

    try {
      const config = await loadDeadlineConfig();
      const isSimulation = config.testingMode?.enabled ?? false;
      const canExecute = config.testingMode?.executeSimulationActions ?? false;

      // SAFETY: In simulation mode with executeSimulationActions=false, NEVER delete
      if (isSimulation && !canExecute) {
        console.log(`[${runId}] 🔬 SIMULATION MODE - No deletions will occur`);
      }

      // Get current year - hard delete runs for sessionEndYear = currentYear - 1
      const currentYear = isSimulation
        ? config.testingMode.customYear
        : new Date().getFullYear();
      const targetSessionEndYear = currentYear - 1;

      console.log(`[${runId}] Deleting students with sessionEndYear: ${targetSessionEndYear}`);

      // Query soft_blocked students from previous year
      const batchSize = 100; // Smaller batch for deleteions
      let lastDoc = null;

      while (true) {
        let query = db.collection('students')
          .where('sessionEndYear', '==', targetSessionEndYear)
          .where('status', 'in', ['soft_blocked', 'pending_deletion'])
          .orderBy('__name__')
          .limit(batchSize);

        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        for (const doc of snapshot.docs) {
          const student = { id: doc.id, ...doc.data() };
          stats.processed++;

          // Skip if missing sessionEndYear (safety)
          if (!student.sessionEndYear) {
            console.log(`[${runId}] ⚠️ Skipping ${student.id}: missing sessionEndYear`);
            stats.skipped++;
            continue;
          }

          if (isSimulation && !canExecute) {
            console.log(`[${runId}][SIM] Would delete: ${student.id} (${student.email || 'no email'})`);
            stats.deleted++;
            continue;
          }

          // Execute multi-step deletion
          try {
            // Step 1: Mark as pending_deletion
            await db.collection('students').doc(student.id).update({
              status: 'pending_deletion',
              hardDeleteScheduledAt: FieldValue.serverTimestamp()
            });

            // Step 2: Delete student document
            await db.collection('students').doc(student.id).delete();

            // Step 3: Delete user document if exists
            if (student.uid) {
              try {
                await db.collection('users').doc(student.uid).delete();
              } catch (e) { /* ignore */ }

              // Step 4: Revoke Firebase Auth
              try {
                await admin.auth().deleteUser(student.uid);
                console.log(`[${runId}] 🔐 Auth revoked: ${student.uid}`);
              } catch (e) {
                console.log(`[${runId}] ⚠️ Auth revocation skipped: ${e.message}`);
              }
            }

            console.log(`[${runId}] ✅ Deleted: ${student.id}`);
            stats.deleted++;

          } catch (err) {
            console.error(`[${runId}] ❌ Error deleting ${student.id}:`, err.message);
            stats.errors++;
          }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }

      console.log(`[${runId}] 📊 Completed. Stats:`, JSON.stringify(stats));

    } catch (error) {
      console.error(`[${runId}] ❌ Fatal error:`, error);
      throw error;
    }
  }
);

/**
 * Load deadline configuration
 * In production, this reads from a config source
 * Returns default config if not available
 */
async function loadDeadlineConfig() {
  // Default configuration (matches deadline-config.json structure)
  // In production, this could read from Cloud Storage or environment
  return {
    academicYear: { anchorMonth: 5, anchorDay: 30 }, // June 30 (0-indexed)
    renewalNotification: { month: 5, day: 1 },       // June 1
    renewalDeadline: { month: 6, day: 1 },           // July 1
    softBlock: { month: 6, day: 31 },                // July 31
    hardDelete: { month: 7, day: 31 },               // August 31
    urgentWarningThreshold: { days: 15 },
    testingMode: {
      enabled: false,
      customYear: 2026,
      executeSimulationActions: false
    }
  };
}

// ============================================
// EXPORT DEFAULT (REQUIRED FOR FIREBASE)
// ============================================
export default {
  getFirestoreHealth,
  enforceSoftBlock,
  sendUrgentWarnings,
  enforceHardDelete
};
