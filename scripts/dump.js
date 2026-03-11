const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Missing Firebase credentials.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
});

const db = admin.firestore();

async function run() {
    const q = await db.collection('applications').where('formData.fullName', '==', 'Renu Patowary').get();
    if (q.empty) {
        console.log("No application found for Renu Patowary.");
    } else {
        console.dir(q.docs[0].data(), { depth: null });
    }

    const routes = await db.collection('routes').get();
    console.log("Routes:", routes.docs.map(d => d.id));
    process.exit(0);
}

run().catch(console.error);
