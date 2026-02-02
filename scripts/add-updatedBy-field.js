#!/usr/bin/env node
/**
 * Migration Script: Add 'updatedBy' field to existing documents
 * 
 * This script adds an empty 'updatedBy' array field to all documents in the following collections:
 * - moderators
 * - students
 * - drivers
 * - buses
 * - routes
 * 
 * Run with: node scripts/add-updatedBy-field.js
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

admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
});

const db = admin.firestore();

// Collections to update
const COLLECTIONS = ['moderators', 'students', 'drivers', 'buses', 'routes'];

async function addUpdatedByField() {
    console.log('🚀 Starting migration: Adding updatedBy field to existing documents...\n');

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const collectionName of COLLECTIONS) {
        console.log(`📁 Processing collection: ${collectionName}`);

        try {
            const snapshot = await db.collection(collectionName).get();

            if (snapshot.empty) {
                console.log(`   ⚠️  No documents found in ${collectionName}`);
                continue;
            }

            let updated = 0;
            let skipped = 0;
            const batch = db.batch();
            let batchCount = 0;

            for (const doc of snapshot.docs) {
                const data = doc.data();

                // Skip if updatedBy field already exists
                if (data.updatedBy !== undefined) {
                    skipped++;
                    continue;
                }

                // Add empty updatedBy array
                batch.update(doc.ref, {
                    updatedBy: []
                });

                updated++;
                batchCount++;

                // Firestore batches can only contain 500 operations
                if (batchCount >= 500) {
                    await batch.commit();
                    console.log(`   ✅ Committed batch of ${batchCount} updates`);
                    batchCount = 0;
                }
            }

            // Commit remaining updates
            if (batchCount > 0) {
                await batch.commit();
            }

            console.log(`   ✅ Updated: ${updated} documents`);
            console.log(`   ⏭️  Skipped: ${skipped} documents (already have updatedBy field)`);
            console.log('');

            totalUpdated += updated;
            totalSkipped += skipped;

        } catch (error) {
            console.error(`   ❌ Error processing ${collectionName}:`, error.message);
        }
    }

    console.log('═══════════════════════════════════════════');
    console.log('📊 Migration Summary:');
    console.log(`   Total documents updated: ${totalUpdated}`);
    console.log(`   Total documents skipped: ${totalSkipped}`);
    console.log('═══════════════════════════════════════════');
    console.log('✅ Migration completed successfully!');
}

addUpdatedByField()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    });
