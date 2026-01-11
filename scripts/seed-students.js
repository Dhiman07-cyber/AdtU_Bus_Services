const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { v4: uuidv4 } = require('uuid');

// Basic random data generators since we don't have faker
const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayan', 'Krishna', 'Ishaan', 'Diya', 'Saanvi', 'Ananya', 'Aadhya', 'Kiara', 'Pari', 'Riya', 'Anika', 'Myra', 'Prisha'];
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Das', 'Nair', 'Bhat', 'Mehta', 'Jain', 'Shah', 'Agarwal', 'Chopra'];
const DEPARTMENTS = ['B.Tech CSE', 'B.Tech IT', 'B.Tech ECE', 'B.Tech Civil', 'B.Tech ME'];
const FACULTIES = ['Faculty of Engineering', 'Faculty of Technology'];
const TOWNS = ['Guwahati', 'Dispur', 'Jorhat', 'Tezpur', 'Nagaon', 'Silchar'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomPhone() {
    return '9' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
}

function generateRandomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedStudents() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    if (!projectId || !clientEmail || !privateKey) {
        console.error('❌ ERROR: Missing credentials in .env');
        process.exit(1);
    }

    // Initialize Firebase Admin
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey
            })
        });
    }

    const db = admin.firestore();
    console.log('🚀 Starting student seeding...');

    try {
        // 1. Fetch Target Bus
        const TARGET_BUS_IDENTIFIER = 'AS-01-SC-1392';
        console.log(`📦 Fetching bus ${TARGET_BUS_IDENTIFIER} and routes...`);

        const busesSnap = await db.collection('buses').get();
        const routesSnap = await db.collection('routes').get();

        const buses = busesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const routes = routesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Find specific bus
        const targetBus = buses.find(b => b.busNumber === TARGET_BUS_IDENTIFIER || b.id === TARGET_BUS_IDENTIFIER);

        if (!targetBus) {
            throw new Error(`Bus ${TARGET_BUS_IDENTIFIER} not found in Firestore.`);
        }

        console.log(`✅ Found Target Bus: ${targetBus.busNumber} (${targetBus.id})`);

        // 2. Generate 50 Students for this bus
        const STUDENTS_TO_GENERATE = 2;
        const students = [];
        const busLoadUpdates = {};

        // Initialize load tracker for the target bus
        busLoadUpdates[targetBus.id] = {
            morningCount: targetBus.load?.morningCount || 0,
            eveningCount: targetBus.load?.eveningCount || 0,
            deltaMorning: 0,
            deltaEvening: 0
        };

        // Determine Route
        let route = null;
        if (targetBus.routeId) {
            route = routes.find(r => r.id === targetBus.routeId || r.routeId === targetBus.routeId);
        }

        if (!route && targetBus.route && targetBus.route.stops) {
            route = targetBus.route;
        }

        if (!route) {
            throw new Error(`Bus ${targetBus.busNumber} has no valid route.`);
        }

        const stops = route.stops || [];
        if (stops.length === 0) {
            throw new Error(`Route for Bus ${targetBus.busNumber} has no stops.`);
        }

        for (let i = 0; i < STUDENTS_TO_GENERATE; i++) {
            // Bus is fixed: targetBus
            const bus = targetBus;

            // Shift is fixed: Morning
            const shift = 'Morning';

            // Select Pickup Point
            const stop = getRandomElement(stops);
            const stopName = stop.name || stop.stopId;
            const stopId = stop.stopId || stop.id;

            // Generate Personal Details
            const firstName = getRandomElement(FIRST_NAMES);
            const lastName = getRandomElement(LAST_NAMES);
            const fullName = `${firstName} ${lastName}`;
            const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${getRandomInt(1, 999)}@example.com`;

            // Update local load counters
            busLoadUpdates[bus.id].deltaMorning++;

            const student = {
                uid: uuidv4(),
                name: firstName,
                fullName: fullName,
                email: email,
                phone: generateRandomPhone(),
                parentName: `${getRandomElement(FIRST_NAMES)} ${lastName}`,
                parentPhone: generateRandomPhone(),
                enrollmentId: `ADTU/0/2025-${getRandomInt(26, 28)}/BCSM/${getRandomInt(100, 999)}`,
                faculty: getRandomElement(FACULTIES),
                department: getRandomElement(DEPARTMENTS),
                gender: getRandomElement(['Male', 'Female']),
                dob: generateRandomDate(new Date(2003, 0, 1), new Date(2006, 0, 1)).toISOString().split('T')[0],
                age: getRandomInt(18, 22),
                bloodGroup: getRandomElement(BLOOD_GROUPS),
                address: `${getRandomElement(TOWNS)}, Assam`,

                // Allocation Details
                busId: bus.id,
                busAssigned: bus.busNumber,
                routeId: route.routeId || route.id,
                stopId: stopId,
                pickupPoint: stopName,
                stopName: stopName,
                shift: shift,

                role: 'student',
                status: 'active',

                // Session Details
                sessionDuration: 2,
                sessionStartYear: 2025,
                sessionEndYear: 2027,
                validUntil: new Date(2027, 5, 30).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),

                // Payment (Dummy)
                paymentAmount: 10000,
                paid_on: new Date().toISOString(),
                profilePhotoUrl: "https://via.placeholder.com/150"
            };

            students.push(student);
        }

        console.log(`✨ Generated ${students.length} students.`);

        // 3. Write to Firestore
        const batchSize = 500;
        const batches = [];
        let batch = db.batch();
        let operationCount = 0;

        for (const student of students) {
            const ref = db.collection('students').doc(student.uid);
            batch.set(ref, student);
            operationCount++;

            if (operationCount >= batchSize) {
                batches.push(batch.commit());
                batch = db.batch();
                operationCount = 0;
            }
        }
        if (operationCount > 0) batches.push(batch.commit());

        await Promise.all(batches);
        console.log(`💾 Persisted ${students.length} students to Firestore.`);

        // 4. Update Bus Loads
        console.log('🔄 Updating bus loads...');
        const busBatch = db.batch();

        for (const [busId, updates] of Object.entries(busLoadUpdates)) {
            const busRef = db.collection('buses').doc(busId);

            const newMorning = updates.morningCount + updates.deltaMorning;
            const newEvening = updates.eveningCount + updates.deltaEvening;
            const newTotal = newMorning + newEvening;

            busBatch.update(busRef, {
                'load.morningCount': newMorning,
                'load.eveningCount': newEvening,
                'load.totalCount': newTotal,
                currentMembers: newTotal, // Updating legacy field
                morningLoad: newMorning, // Adding as requested just in case
                updatedAt: new Date().toISOString()
            });
        }

        await busBatch.commit();
        console.log('✅ Bus loads updated successfully.');

    } catch (error) {
        console.error('❌ Error seeding students:', error);
    }
}

seedStudents();
