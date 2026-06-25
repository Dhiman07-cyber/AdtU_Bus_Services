/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔧 BUS LOAD RECONCILIATION SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Migrate existing bus documents to use per-shift load tracking
 * 
 * WHAT IT DOES:
 * 1. Reads all bus documents
 * 2. Counts students by busId and shift (Morning/Evening)
 * 3. Updates each bus with load.morningCount and load.eveningCount
 * 4. Provides detailed report of changes
 * 
 * WHEN TO RUN:
 * - One-time migration when deploying v2 service
 * - Periodically (weekly) to fix any inconsistencies
 * - After bulk student imports
 * 
 * HOW TO RUN:
 * ```bash
 * npm run reconcile-bus-loads
 * ```
 * Or call directly from admin UI
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

interface BusLoadReport {
  busId: string;
  busNumber: string;
  before: {
    morningCount: number;
    eveningCount: number;
    totalCount: number;
  };
  after: {
    morningCount: number;
    eveningCount: number;
    totalCount: number;
  };
  studentsScanned: number;
  hasDiscrepancy: boolean;
}

interface ReconciliationSummary {
  totalBuses: number;
  busesReconciled: number;
  busesWithDiscrepancies: number;
  totalStudentsCounted: number;
  reports: BusLoadReport[];
  errors: Array<{ busId: string; error: string }>;
  executionTimeMs: number;
}

/**
 * Main reconciliation function
 */
export async function reconcileBusLoads(
  busIds?: string[],
  dryRun: boolean = false
): Promise<ReconciliationSummary> {
  const startTime = Date.now();
  
  console.log('🔧 Starting bus load reconciliation...');
  console.log('Dry run:', dryRun);
  
  const reports: BusLoadReport[] = [];
  const errors: Array<{ busId: string; error: string }> = [];
  let totalStudentsCounted = 0;

  try {
    // Step 1: Get all buses
    let busesToReconcile: any[];
    
    if (busIds && busIds.length > 0) {
      console.log(`Reconciling specific buses: ${busIds.join(', ')}`);
      busesToReconcile = [];
      for (const busId of busIds) {
        const busDoc = await getDocs(query(collection(db, 'buses'), where('__name__', '==', busId)));
        busDoc.forEach(d => busesToReconcile.push({ id: d.id, ...d.data() }));
      }
    } else {
      console.log('Reconciling ALL buses');
      const busesSnap = await getDocs(collection(db, 'buses'));
      busesToReconcile = busesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    console.log(`Found ${busesToReconcile.length} buses to reconcile`);

    // Step 2: Process each bus
    for (const bus of busesToReconcile) {
      try {
        console.log(`\n📊 Processing bus: ${bus.busNumber} (${bus.id})`);

        // Get current load values
        const currentLoad = bus.load || {};
        const before = {
          morningCount: currentLoad.morningCount || 0,
          eveningCount: currentLoad.eveningCount || 0,
          totalCount: currentLoad.totalCount || bus.currentMembers || 0
        };

        // Count actual students by shift
        const studentsQuery = query(
          collection(db, 'students'),
          where('busId', '==', bus.id),
          where('status', '==', 'active')
        );

        const studentsSnap = await getDocs(studentsQuery);
        
        let actualMorningCount = 0;
        let actualEveningCount = 0;

        studentsSnap.forEach(studentDoc => {
          const student = studentDoc.data();
          // Normalize shift IDENTICALLY to the writer (buildCapacityDelta): use
          // case-insensitive includes() so non-canonical casings are not dropped.
          const shift = (student.shift || '').toLowerCase();
          const isMorning = shift.includes('morning') || shift === 'both';
          const isEvening = shift.includes('evening') || shift === 'both';
          if (isMorning) actualMorningCount++;
          if (isEvening) actualEveningCount++;
          if (!isMorning && !isEvening) {
            console.warn(`⚠️  Student ${studentDoc.id} has invalid shift: ${student.shift}`);
          }
        });

        const actualTotalCount = actualMorningCount + actualEveningCount;
        totalStudentsCounted += actualTotalCount;

        console.log('  Before:', before);
        console.log('  Actual:', { 
          morning: actualMorningCount, 
          evening: actualEveningCount, 
          total: actualTotalCount 
        });

        // Check for discrepancies
        const hasDiscrepancy = 
          before.morningCount !== actualMorningCount ||
          before.eveningCount !== actualEveningCount ||
          before.totalCount !== actualTotalCount;

        if (hasDiscrepancy) {
          console.log('  ⚠️  DISCREPANCY DETECTED');
        } else {
          console.log('  ✓ Counts match');
        }

        // Update bus document (if not dry run)
        if (!dryRun) {
          await runTransaction(db, async (transaction) => {
            const busRef = doc(db, 'buses', bus.id);
            transaction.update(busRef, {
              'load.morningCount': actualMorningCount,
              'load.eveningCount': actualEveningCount,
              'load.totalCount': actualTotalCount,
              currentMembers: actualTotalCount, // Also update legacy field
              updatedAt: serverTimestamp()
            });
          });
          console.log('  ✅ Updated');
        } else {
          console.log('  ℹ️  Skipped (dry run)');
        }

        // Add to report
        reports.push({
          busId: bus.id,
          busNumber: bus.busNumber,
          before,
          after: {
            morningCount: actualMorningCount,
            eveningCount: actualEveningCount,
            totalCount: actualTotalCount
          },
          studentsScanned: studentsSnap.size,
          hasDiscrepancy
        });

      } catch (busError: any) {
        console.error(`❌ Error processing bus ${bus.id}:`, busError);
        errors.push({
          busId: bus.id,
          error: busError.message
        });
      }
    }

    // Step 3: Generate summary
    const summary: ReconciliationSummary = {
      totalBuses: busesToReconcile.length,
      busesReconciled: reports.length,
      busesWithDiscrepancies: reports.filter(r => r.hasDiscrepancy).length,
      totalStudentsCounted,
      reports,
      errors,
      executionTimeMs: Date.now() - startTime
    };

    // Print summary
    console.log('\n' + '═'.repeat(80));
    console.log('📋 RECONCILIATION SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total buses: ${summary.totalBuses}`);
    console.log(`Buses reconciled: ${summary.busesReconciled}`);
    console.log(`Buses with discrepancies: ${summary.busesWithDiscrepancies}`);
    console.log(`Total students counted: ${summary.totalStudentsCounted}`);
    console.log(`Errors: ${summary.errors.length}`);
    console.log(`Execution time: ${(summary.executionTimeMs / 1000).toFixed(2)}s`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE (changes committed)'}`);
    console.log('═'.repeat(80));

    if (summary.busesWithDiscrepancies > 0) {
      console.log('\n⚠️  BUSES WITH DISCREPANCIES:');
      reports
        .filter(r => r.hasDiscrepancy)
        .forEach(r => {
          console.log(`\n  ${r.busNumber} (${r.busId}):`);
          console.log(`    Before: M=${r.before.morningCount}, E=${r.before.eveningCount}, T=${r.before.totalCount}`);
          console.log(`    After:  M=${r.after.morningCount}, E=${r.after.eveningCount}, T=${r.after.totalCount}`);
          console.log(`    Students scanned: ${r.studentsScanned}`);
        });
    }

    if (summary.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      summary.errors.forEach(e => {
        console.log(`  ${e.busId}: ${e.error}`);
      });
    }

    console.log('\n✅ Reconciliation complete!');

    return summary;

  } catch (error: any) {
    console.error('❌ Reconciliation failed:', error);
    throw error;
  }
}

/**
 * Export for use in admin UI or Cloud Function
 */
export default reconcileBusLoads;

/**
 * Example usage:
 * 
 * // Dry run (check without modifying):
 * const report = await reconcileBusLoads(undefined, true);
 * 
 * // Live run (apply changes):
 * const report = await reconcileBusLoads(undefined, false);
 * 
 * // Reconcile specific buses:
 * const report = await reconcileBusLoads(['bus_1', 'bus_2'], false);
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLOUD FUNCTION WRAPPER (Optional)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * If deploying as a Cloud Function:
 * 
 * import { https } from 'firebase-functions';
 * import reconcileBusLoads from './reconcile-bus-loads';
 * 
 * export const reconcileBusLoadsFunction = https.onCall(async (data, context) => {
 *   // Check admin permission
 *   if (!context.auth || context.auth.token.role !== 'admin') {
 *     throw new https.HttpsError('permission-denied', 'Admin access required');
 *   }
 * 
 *   const { busIds, dryRun } = data;
 *   return await reconcileBusLoads(busIds, dryRun);
 * });
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
