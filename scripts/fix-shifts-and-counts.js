#!/usr/bin/env node
/**
 * Data Fix Script - Normalize shifts and sync bus counts
 * 
 * This script:
 * 1. Normalizes student shift values ("Evening Shift" -> "Evening")
 * 2. Recalculates all bus counts (currentMembers, morningCount, eveningCount, totalCount)
 * 
 * Usage: node scripts/fix-shifts-and-counts.js
 * 
 * @version 1.0.0
 * @since 2026-01-19
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
    console.error('❌ Missing Firebase Admin credentials');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
});

const db = admin.firestore();

// Normalize shift values
function normalizeShift(shift) {
    if (!shift) return 'Morning';
    const normalized = shift.toLowerCase().trim();
    if (normalized.includes('evening')) return 'Evening';
    if (normalized.includes('morning')) return 'Morning';
    if (normalized === 'both') return 'Both';
    return 'Morning';
}

async function fixData() {
    console.log('='.repeat(60));
    console.log('🔧 DATA FIX: Normalize Shifts & Sync Bus Counts');
    console.log('='.repeat(60));
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log('');

    // ===== PHASE 1: Fix Student Shift Values =====
    console.log('📋 PHASE 1: Normalizing Student Shift Values');
    console.log('-'.repeat(40));

    const studentsSnapshot = await db.collection('students').get();
    const studentBatch = db.batch();
    let studentFixCount = 0;

    for (const doc of studentsSnapshot.docs) {
        const data = doc.data();
        const currentShift = data.shift || '';
        const normalizedShift = normalizeShift(currentShift);

        if (currentShift !== normalizedShift) {
            console.log(`   ✍️ ${data.fullName || doc.id}: "${currentShift}" → "${normalizedShift}"`);
            studentBatch.update(doc.ref, {
                shift: normalizedShift,
                updatedAt: new Date().toISOString()
            });
            studentFixCount++;
        }
    }

    if (studentFixCount > 0) {
        await studentBatch.commit();
        console.log(`   ✅ Fixed ${studentFixCount} student shift values\n`);
    } else {
        console.log('   ✅ All student shifts already normalized\n');
    }

    // ===== PHASE 2: Recalculate Bus Counts =====
    console.log('📋 PHASE 2: Recalculating Bus Counts');
    console.log('-'.repeat(40));

    // Re-fetch students (now with normalized shifts)
    const refreshedStudentsSnapshot = await db.collection('students')
        .where('status', '==', 'active')
        .get();

    const busesSnapshot = await db.collection('buses').get();
    const buses = busesSnapshot.docs.map(doc => ({
        id: doc.id,
        ref: doc.ref,
        ...doc.data()
    }));

    console.log(`   📊 Found ${buses.length} buses`);
    console.log(`   👥 Found ${refreshedStudentsSnapshot.size} active students`);

    // Build counts per bus
    const busCounts = new Map();
    buses.forEach(bus => {
        busCounts.set(bus.id, { morningCount: 0, eveningCount: 0, total: 0 });
    });

    refreshedStudentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const busId = data.busId || data.assignedBusId || '';
        if (!busId) return;

        // Find matching bus
        let matchedBusId = null;
        for (const bus of buses) {
            if (bus.id === busId || bus.busId === busId || bus.busNumber === busId) {
                matchedBusId = bus.id;
                break;
            }
        }
        if (!matchedBusId) return;

        const counts = busCounts.get(matchedBusId);
        const shift = (data.shift || 'Morning').toLowerCase();

        counts.total++;
        if (shift.includes('morning') || shift === 'both') {
            counts.morningCount++;
        }
        if (shift.includes('evening') || shift === 'both') {
            counts.eveningCount++;
        }
        busCounts.set(matchedBusId, counts);
    });

    // Update buses
    const busBatch = db.batch();
    let busFixCount = 0;

    for (const bus of buses) {
        const counts = busCounts.get(bus.id) || { morningCount: 0, eveningCount: 0, total: 0 };

        const oldCounts = {
            currentMembers: bus.currentMembers || 0,
            morningCount: bus.load?.morningCount || 0,
            eveningCount: bus.load?.eveningCount || 0,
            totalCount: bus.load?.totalCount || 0,
        };

        const newCounts = {
            currentMembers: counts.total,
            morningCount: counts.morningCount,
            eveningCount: counts.eveningCount,
            totalCount: counts.total, // totalCount = total students
        };

        // Check if any value differs
        const needsUpdate =
            oldCounts.currentMembers !== newCounts.currentMembers ||
            oldCounts.morningCount !== newCounts.morningCount ||
            oldCounts.eveningCount !== newCounts.eveningCount ||
            oldCounts.totalCount !== newCounts.totalCount;

        if (needsUpdate) {
            console.log(`\n   📌 ${bus.busNumber || bus.id}:`);
            if (oldCounts.currentMembers !== newCounts.currentMembers) {
                console.log(`      currentMembers: ${oldCounts.currentMembers} → ${newCounts.currentMembers}`);
            }
            if (oldCounts.morningCount !== newCounts.morningCount) {
                console.log(`      load.morningCount: ${oldCounts.morningCount} → ${newCounts.morningCount}`);
            }
            if (oldCounts.eveningCount !== newCounts.eveningCount) {
                console.log(`      load.eveningCount: ${oldCounts.eveningCount} → ${newCounts.eveningCount}`);
            }
            if (oldCounts.totalCount !== newCounts.totalCount) {
                console.log(`      load.totalCount: ${oldCounts.totalCount} → ${newCounts.totalCount}`);
            }

            busBatch.update(bus.ref, {
                currentMembers: newCounts.currentMembers,
                'load.morningCount': newCounts.morningCount,
                'load.eveningCount': newCounts.eveningCount,
                'load.totalCount': newCounts.totalCount,
                updatedAt: new Date().toISOString(),
            });
            busFixCount++;
        }
    }

    if (busFixCount > 0) {
        await busBatch.commit();
        console.log(`\n   ✅ Fixed ${busFixCount} bus count records`);
    } else {
        console.log('\n   ✅ All bus counts already correct');
    }

    // ===== SUMMARY =====
    console.log('');
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Students with shift normalized: ${studentFixCount}`);
    console.log(`   Buses with counts fixed: ${busFixCount}`);
    console.log('');
    console.log('✅ Data fix completed!');
    console.log('');

    process.exit(0);
}

fixData().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
