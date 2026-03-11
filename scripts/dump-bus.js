const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });

const db = admin.firestore();
async function run() {
    const busDoc = await db.collection('buses').doc('bus_6').get();
    console.log("Bus Data for bus_6:");
    console.dir(busDoc.data(), { depth: null });
    process.exit(0);
}

run().catch(console.error);
