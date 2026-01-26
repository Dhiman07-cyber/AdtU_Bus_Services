#!/usr/bin/env node
/**
 * Check actual Firestore bus document values
 */

const admin = require('firebase-admin');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
});

const db = admin.firestore();

async function checkBus4() {
    console.log('🔍 Checking bus_4 (AS-01-SC-1393) document...\n');

    const busDoc = await db.collection('buses').doc('bus_4').get();

    if (!busDoc.exists) {
        console.log('❌ bus_4 not found!');
        process.exit(1);
    }

    const data = busDoc.data();

    console.log('📄 Bus Document:');
    console.log(`   busNumber: ${data.busNumber}`);
    console.log(`   capacity: ${data.capacity}`);
    console.log(`   currentMembers: ${data.currentMembers}`);
    console.log(`   load.morningCount: ${data.load?.morningCount}`);
    console.log(`   load.eveningCount: ${data.load?.eveningCount}`);
    console.log(`   shift: ${data.shift}`);
    console.log('');

    // Count actual students
    const studentsSnapshot = await db.collection('students')
        .where('busId', '==', 'bus_4')
        .where('status', '==', 'active')
        .get();

    console.log(`👥 Actual students with busId="bus_4": ${studentsSnapshot.size}`);

    let morning = 0, evening = 0;
    studentsSnapshot.docs.forEach(doc => {
        const shift = (doc.data().shift || 'morning').toLowerCase();
        if (shift.includes('morning')) morning++;
        if (shift.includes('evening')) evening++;
    });

    console.log(`   Morning shift: ${morning}`);
    console.log(`   Evening shift: ${evening}`);
    console.log('');

    // Check if update is needed
    if (data.currentMembers !== studentsSnapshot.size ||
        data.load?.morningCount !== morning ||
        data.load?.eveningCount !== evening) {
        console.log('⚠️ MISMATCH DETECTED!');
        console.log('   Expected:');
        console.log(`      currentMembers: ${studentsSnapshot.size}`);
        console.log(`      load.morningCount: ${morning}`);
        console.log(`      load.eveningCount: ${evening}`);
        console.log('');
        console.log('🔧 Fixing now...');

        await db.collection('buses').doc('bus_4').update({
            currentMembers: studentsSnapshot.size,
            'load.morningCount': morning,
            'load.eveningCount': evening,
            updatedAt: new Date().toISOString()
        });

        console.log('✅ Fixed!');
    } else {
        console.log('✅ Counts match - no update needed');
    }

    process.exit(0);
}

checkBus4().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
