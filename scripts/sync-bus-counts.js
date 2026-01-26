#!/usr/bin/env node
/**
 * Bus Count Synchronization Script
 * 
 * Recalculates currentMembers, load.morningCount, and load.eveningCount
 * for all buses based on actual student assignments.
 * 
 * Usage: node scripts/sync-bus-counts.js
 * 
 * @module scripts/sync-bus-counts
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
    console.error('❌ Missing Firebase Admin credentials in environment variables.');
    console.error('Required: NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
    })
});

const db = admin.firestore();

async function syncBusCounts() {
    console.log('='.repeat(60));
    console.log('🔄 BUS COUNT SYNCHRONIZATION');
    console.log('='.repeat(60));
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log('');

    // Get all buses
    console.log('📊 Fetching buses...');
    const busesSnapshot = await db.collection('buses').get();
    const buses = busesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    console.log(`   Found ${buses.length} buses`);

    // Get all active students
    console.log('👥 Fetching active students...');
    const studentsSnapshot = await db.collection('students')
        .where('status', '==', 'active')
        .get();

    const students = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    console.log(`   Found ${students.length} active students`);
    console.log('');

    // Build a map of busId -> { morningCount, eveningCount, total }
    const busCounts = new Map();

    // Initialize all buses with zero counts
    buses.forEach(bus => {
        busCounts.set(bus.id, { morningCount: 0, eveningCount: 0, total: 0 });
    });

    // Count students per bus
    let unmatchedStudents = 0;
    students.forEach(student => {
        // Check both busId and assignedBusId fields
        const busId = student.busId || student.assignedBusId || '';
        if (!busId) {
            console.log(`   ⚠️ Student ${student.fullName || student.id} has no busId`);
            return;
        }

        // Find matching bus (by id, busId field, or busNumber)
        let matchedBusId = null;

        for (const bus of buses) {
            if (
                bus.id === busId ||
                bus.busId === busId ||
                bus.busNumber === busId
            ) {
                matchedBusId = bus.id;
                break;
            }
        }

        if (!matchedBusId) {
            console.log(`   ⚠️ Student ${student.fullName || student.id} has unknown busId: ${busId}`);
            unmatchedStudents++;
            return;
        }

        const counts = busCounts.get(matchedBusId) || { morningCount: 0, eveningCount: 0, total: 0 };
        const shift = (student.shift || 'morning').toLowerCase();

        counts.total++;
        // Use includes() to handle variations like "Morning", "morning shift", "Evening Shift"
        if (shift.includes('morning') || shift === 'both') {
            counts.morningCount++;
        }
        if (shift.includes('evening') || shift === 'both') {
            counts.eveningCount++;
        }

        busCounts.set(matchedBusId, counts);
    });

    if (unmatchedStudents > 0) {
        console.log(`\n⚠️ ${unmatchedStudents} students have unmatched bus IDs\n`);
    }

    // Update all buses with correct counts
    const updates = [];
    const batch = db.batch();

    for (const bus of buses) {
        const counts = busCounts.get(bus.id) || { morningCount: 0, eveningCount: 0, total: 0 };
        const busRef = db.collection('buses').doc(bus.id);

        const oldCounts = {
            currentMembers: bus.currentMembers || 0,
            morningCount: bus.load?.morningCount || 0,
            eveningCount: bus.load?.eveningCount || 0,
        };

        const newCounts = {
            currentMembers: counts.total,
            morningCount: counts.morningCount,
            eveningCount: counts.eveningCount,
        };

        // Only update if counts differ
        if (
            oldCounts.currentMembers !== newCounts.currentMembers ||
            oldCounts.morningCount !== newCounts.morningCount ||
            oldCounts.eveningCount !== newCounts.eveningCount
        ) {
            batch.update(busRef, {
                currentMembers: newCounts.currentMembers,
                'load.morningCount': newCounts.morningCount,
                'load.eveningCount': newCounts.eveningCount,
                updatedAt: new Date().toISOString(),
            });

            updates.push({
                busId: bus.id,
                busNumber: bus.busNumber || bus.id,
                old: oldCounts,
                new: newCounts,
            });
        }
    }

    console.log('='.repeat(60));
    console.log('📝 CHANGES');
    console.log('='.repeat(60));

    if (updates.length > 0) {
        updates.forEach(u => {
            console.log(`\n   📌 ${u.busNumber} (${u.busId}):`);
            console.log(`      Total Members: ${u.old.currentMembers} → ${u.new.currentMembers}`);
            console.log(`      Morning Count: ${u.old.morningCount} → ${u.new.morningCount}`);
            console.log(`      Evening Count: ${u.old.eveningCount} → ${u.new.eveningCount}`);
        });

        await batch.commit();
        console.log(`\n✅ Updated ${updates.length} buses successfully!`);
    } else {
        console.log('\n✅ All bus counts are already correct - no changes needed');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Total buses: ${buses.length}`);
    console.log(`   Total active students: ${students.length}`);
    console.log(`   Buses updated: ${updates.length}`);
    console.log('');

    process.exit(0);
}

// Run the script
syncBusCounts().catch(error => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
});
