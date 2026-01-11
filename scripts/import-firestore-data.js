const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Helper to restore timestamps and references
function restoreFirestoreTypes(obj, db) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (obj._type === 'timestamp' && obj.value) {
        return admin.firestore.Timestamp.fromDate(new Date(obj.value));
    }

    if (obj._type === 'reference' && obj.path) {
        return db.doc(obj.path);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => restoreFirestoreTypes(item, db));
    }

    const restored = {};
    for (const key in obj) {
        restored[key] = restoreFirestoreTypes(obj[key], db);
    }
    return restored;
}

async function importData() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    if (!projectId || !clientEmail || !privateKey) {
        console.error('❌ Missing credentials');
        process.exit(1);
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey
        })
    });

    const db = admin.firestore();
    const auth = admin.auth();

    // Read data file
    const dataPath = path.join(__dirname, '..', 'firestore_data.json');
    if (!fs.existsSync(dataPath)) {
        console.error('❌ firestore_data.json not found');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    console.log('🚀 Starting Import...');

    // 1. Import Collections
    for (const collectionName in data.collections) {
        console.log(`\n📦 Importing collection: ${collectionName}`);
        const collectionData = data.collections[collectionName];

        if (!collectionData.documents) continue;

        const batchSize = 500;
        let batch = db.batch();
        let count = 0;

        for (const docId in collectionData.documents) {
            const docData = restoreFirestoreTypes(collectionData.documents[docId], db);
            const docRef = db.collection(collectionName).doc(docId);
            batch.set(docRef, docData);
            count++;

            if (count % batchSize === 0) {
                await batch.commit();
                console.log(`   - Committed batch of ${batchSize}`);
                batch = db.batch();
            }
        }

        if (count % batchSize !== 0) {
            await batch.commit();
        }
        console.log(`   ✅ Imported ${count} documents into ${collectionName}`);
    }

    // 2. Sync Authentication Users
    console.log('\n🔐 Syncing Authentication Users from previous backup...');
    console.log('NOTE: Existing users will be re-created to remove password requirements (facilitating Google Sign-In).');

    const users = data.collections.users?.documents || {};

    for (const uid in users) {
        const userData = users[uid];
        if (!userData.email) continue;

        // Step 1: Check and Delete User (to clear password provider)
        try {
            await auth.getUser(uid);
            // If user exists, delete to reset provider data
            console.log(`   - Found existing user ${userData.email}. Deleting to reset provider configuration...`);
            await auth.deleteUser(uid);
        } catch (error) {
            // Ignore user-not-found error
            if (error.code !== 'auth/user-not-found') {
                console.error(`   ❌ Error verifying/deleting user ${userData.email}:`, error.message);
                continue;
            }
        }

        // Step 2: Create User WITHOUT Password
        try {
            await auth.createUser({
                uid: uid,
                email: userData.email,
                displayName: userData.name || userData.fullName,
                emailVerified: true // Important for Google linking
                // NO PASSWORD SET HERE
            });
            console.log(`   ✅ Re-created user ${userData.email} (Ready for Google Sign-In/Link)`);
        } catch (createError) {
            console.error(`   ❌ Error creating user ${userData.email}:`, createError.message);
        }
    }

    console.log('\n✨ Import Completed Successfully!');
}

importData().catch(console.error);
