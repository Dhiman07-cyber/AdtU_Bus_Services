#!/usr/bin/env node
/**
 * Migration Script: Fix Bus Counts based on Student Collection
 * 
 * This script recalculates bus loads based on active students and cleans up
 * redundant fields like "morningLoad" and "currentMembers".
 * 
 * Usage: node scripts/fix-bus-counts.js
 * 
 * Options:
 *   --dry-run    Preview changes without applying them
 */

const admin = require('firebase-admin');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Missing Firebase credentials. Check your .env file.');
    process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
});

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function fixBusCounts() {
    console.log('='.repeat(70));
    console.log('🚀 MIGRATION: Fix Bus Counts & Clean Up');
    console.log('='.repeat(70));
    console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE UPDATE'}`);
    console.log('');

    try {
        console.log('📊 Fetching students from Firestore...');
        const studentsSnapshot = await db.collection('students').get();
        // Ignore unassigned or inactive students (if needed). 
        // We'll trust that 'busId' existing is enough, but typically we only count "Active" or valid students.
        // In this system, active students usually have a busId. We will process all students to be safe,
        // or just those that have a busId. Let's just group by busId.

        const busLoadData = {};

        studentsSnapshot.docs.forEach(doc => {
            const student = doc.data();
            const busId = student.busId || student.assignedBusId;
            // The assignment logic may sometimes leave students with empty status or "active" / "approved".
            // Let's count them if they are assigned to a bus.

            if (!busId) return;

            if (!busLoadData[busId]) {
                busLoadData[busId] = {
                    totalCount: 0,
                    morningCount: 0,
                    eveningCount: 0
                };
            }

            const shift = (student.shift || 'Both').toLowerCase(); // Assuming default is Both if not set

            busLoadData[busId].totalCount += 1; // 1 distinct student

            if (shift.includes('morning') || shift === 'both') {
                busLoadData[busId].morningCount += 1;
            }
            if (shift.includes('evening') || shift === 'both') {
                busLoadData[busId].eveningCount += 1;
            }
        });

        console.log('📊 Fetching buses from Firestore...');
        const busesSnapshot = await db.collection('buses').get();

        let updatedCount = 0;
        let batchCount = 0;
        const batch = db.batch();
        const MAX_BATCH_SIZE = 500;

        for (const busDoc of busesSnapshot.docs) {
            const busId = busDoc.id;
            const data = busDoc.data();
            const counts = busLoadData[busId] || { totalCount: 0, morningCount: 0, eveningCount: 0 };

            let needsUpdate = false;
            let updateData = {};

            // 1. Check counts discrepancy
            const currentLoad = data.load || {};
            if (
                currentLoad.totalCount !== counts.totalCount ||
                currentLoad.morningCount !== counts.morningCount ||
                currentLoad.eveningCount !== counts.eveningCount
            ) {
                needsUpdate = true;
                updateData.load = {
                    ...currentLoad,
                    totalCount: counts.totalCount,
                    morningCount: counts.morningCount,
                    eveningCount: counts.eveningCount
                };
            }

            // 2. Remove redundant `morningLoad` field
            if (data.morningLoad !== undefined) {
                needsUpdate = true;
                updateData.morningLoad = admin.firestore.FieldValue.delete();
            }

            // 3. Sync `currentMembers` with totalCount (legacy field, but still used in UI)
            if (data.currentMembers !== counts.totalCount) {
                needsUpdate = true;
                updateData.currentMembers = counts.totalCount;
            }

            if (needsUpdate) {
                if (isDryRun) {
                    console.log(`   🔍 ${data.busNumber || busId}: Would update stats to -> Total: ${counts.totalCount}, Morning: ${counts.morningCount}, Evening: ${counts.eveningCount}`);
                    if (data.morningLoad !== undefined) console.log(`      (Will delete 'morningLoad')`);
                    if (data.currentMembers !== counts.totalCount) console.log(`      (Will update 'currentMembers' to ${counts.totalCount})`);
                    updatedCount++;
                } else {
                    updateData.updatedAt = new Date().toISOString();
                    batch.update(busDoc.ref, updateData);
                    console.log(`   ✅ ${data.busNumber || busId}: Updated stats to -> Total: ${counts.totalCount}, Morning: ${counts.morningCount}, Evening: ${counts.eveningCount}`);
                    updatedCount++;
                    batchCount++;

                    if (batchCount >= MAX_BATCH_SIZE) {
                        await batch.commit();
                        console.log(`   💾 Committed batch of ${batchCount} updates`);
                        batchCount = 0;
                    }
                }
            }
        }

        if (!isDryRun && batchCount > 0) {
            await batch.commit();
            console.log(`   💾 Committed final batch of ${batchCount} updates`);
        }

        console.log('');
        console.log(`✅ Completed. Buses ${isDryRun ? 'to be updated' : 'updated'}: ${updatedCount}`);

    } catch (error) {
        console.error('❌ Error during migration:', error);
        process.exit(1);
    }
}

fixBusCounts()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });
