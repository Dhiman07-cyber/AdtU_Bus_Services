#!/usr/bin/env node
/**
 * Debug Script - Check student busId values
 * 
 * Usage: node scripts/debug-bus-ids.js
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

async function debugBusIds() {
    console.log('='.repeat(60));
    console.log('🔍 DEBUG: Student Bus ID Analysis');
    console.log('='.repeat(60));
    console.log('');

    // Get all buses first
    const busesSnapshot = await db.collection('buses').get();
    const buses = busesSnapshot.docs.map(doc => ({
        id: doc.id,
        busNumber: doc.data().busNumber,
        busId: doc.data().busId,
    }));

    console.log('📊 BUSES:');
    buses.forEach(bus => {
        console.log(`   ${bus.id} → busNumber: ${bus.busNumber}, busId field: ${bus.busId || 'N/A'}`);
    });
    console.log('');

    // Get all active students
    const studentsSnapshot = await db.collection('students')
        .where('status', '==', 'active')
        .get();

    console.log(`👥 Found ${studentsSnapshot.size} active students\n`);

    // Group students by their busId values
    const busIdGroups = new Map();

    studentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const busId = data.busId || '';
        const assignedBusId = data.assignedBusId || '';
        const key = `busId: "${busId}" | assignedBusId: "${assignedBusId}"`;

        if (!busIdGroups.has(key)) {
            busIdGroups.set(key, []);
        }
        busIdGroups.get(key).push({
            name: data.fullName || data.name || doc.id,
            shift: data.shift || 'N/A'
        });
    });

    console.log('📋 STUDENT BUS ASSIGNMENTS (grouped by busId format):');
    console.log('');

    for (const [key, students] of busIdGroups) {
        console.log(`   ${key}`);
        console.log(`   Count: ${students.length} students`);
        students.slice(0, 3).forEach(s => {
            console.log(`      - ${s.name} (${s.shift})`);
        });
        if (students.length > 3) {
            console.log(`      ... and ${students.length - 3} more`);
        }
        console.log('');
    }

    // Show specific students on Bus-4 (AS-01-SC-1393)
    console.log('='.repeat(60));
    console.log('🎯 FOCUS: Students that should be on Bus AS-01-SC-1393');
    console.log('='.repeat(60));

    const bus4Ids = ['bus_4', 'Bus-4', 'AS-01-SC-1393', '4'];
    let foundForBus4 = 0;

    studentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const busId = (data.busId || '').toLowerCase();
        const assignedBusId = (data.assignedBusId || '').toLowerCase();

        const matchesBus4 = bus4Ids.some(id =>
            busId === id.toLowerCase() ||
            assignedBusId === id.toLowerCase() ||
            busId.includes('4') ||
            assignedBusId.includes('4')
        );

        if (matchesBus4) {
            foundForBus4++;
            console.log(`   ✓ ${data.fullName || doc.id}`);
            console.log(`      busId: "${data.busId}", assignedBusId: "${data.assignedBusId}", shift: ${data.shift}`);
        }
    });

    console.log(`\n   Total found: ${foundForBus4} students`);
    console.log('');

    process.exit(0);
}

debugBusIds().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
