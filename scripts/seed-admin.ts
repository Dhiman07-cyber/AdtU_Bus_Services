
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

async function seedAdmin() {
    console.log('🌱 Seeding Admin User...');

    try {
        // 1. Initialize Firebase Admin
        if (!getApps().length) {
            const serviceAccount = {
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            };

            if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
                throw new Error('Missing Firebase Admin credentials in .env');
            }

            initializeApp({
                credential: cert(serviceAccount)
            });
            console.log('✅ Firebase Admin initialized');
        }

        const db = getFirestore();
        const auth = getAuth();

        // 2. Define the admin user
        const adminEmail = 'dhimansaikia2007@gmail.com'; // User's email from CLI logs

        // 3. Check if user exists in Auth
        let userRecord;
        try {
            userRecord = await auth.getUserByEmail(adminEmail);
            console.log(`👤 Found existing Auth user: ${userRecord.uid}`);
        } catch (e: any) {
            if (e.code === 'auth/user-not-found') {
                console.log(`👤 User not found in Auth, creating: ${adminEmail}`);
                userRecord = await auth.createUser({
                    email: adminEmail,
                    emailVerified: true,
                    displayName: 'Dhiman Saikia'
                });
                console.log(`✅ Created Auth user: ${userRecord.uid}`);
            } else {
                throw e;
            }
        }

        const uid = userRecord.uid;

        // 4. Create/Update 'users' collection doc
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.set({
            uid: uid,
            email: adminEmail,
            role: 'admin',
            fullName: 'Dhiman Saikia',
            displayName: 'Dhiman Saikia', // Add this for consistency
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`✅ Updated 'users' collection for ${uid}`);

        // 5. Create/Update 'admins' collection doc
        const adminDocRef = db.collection('admins').doc(uid);
        await adminDocRef.set({
            uid: uid,
            email: adminEmail,
            username: 'dhiman2007',
            fullName: 'Dhiman Saikia',
            role: 'super_admin',
            createdAt: new Date().toISOString(),
            permissions: ['all']
        }, { merge: true });
        console.log(`✅ Updated 'admins' collection for ${uid}`);

        console.log('✨ Admin seeding completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedAdmin();
