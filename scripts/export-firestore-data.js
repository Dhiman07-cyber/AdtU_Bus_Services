#!/usr/bin/env node
/**
 * Firestore Data Export Script
 * 
 * Exports all Firestore collections to a local JSON file for backup purposes.
 * This allows you to migrate data to a different Firebase account if the quota is exceeded.
 * 
 * Usage: node scripts/export-firestore-data.js
 * 
 * @module scripts/export-firestore-data
 * @version 1.0.0
 * @since 2026-01-03
 */

const admin = require('firebase-admin');
const fs = require('fs');
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

// Collections to export (all main collections in your Firestore)
const COLLECTIONS_TO_EXPORT = [
    'users',
    'students',
    'drivers',
    'buses',
    'routes',
    'moderators',
    'applications',
    'notifications',
    'payments',
    'config',
    'systemConfig',
    'systemSignals'
];

async function exportCollection(collectionName) {
    console.log(`📦 Exporting ${collectionName}...`);

    try {
        const snapshot = await db.collection(collectionName).get();
        const documents = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            // Convert Firestore Timestamps to ISO strings for JSON compatibility
            documents[doc.id] = convertTimestamps(data);
        });

        console.log(`   ✅ Exported ${snapshot.size} documents from ${collectionName}`);
        return { collectionName, documents, count: snapshot.size };
    } catch (error) {
        console.error(`   ❌ Error exporting ${collectionName}:`, error.message);
        return { collectionName, documents: {}, count: 0, error: error.message };
    }
}

function convertTimestamps(obj, seen = new Set()) {
    if (obj === null || obj === undefined) return obj;

    // Handle primitive types
    if (typeof obj !== 'object') return obj;

    // Handle circular references
    if (seen.has(obj)) return '[Circular]';

    // Firestore Timestamp (Admin SDK)
    if (obj.toDate && typeof obj.toDate === 'function') {
        return { _type: 'timestamp', value: obj.toDate().toISOString() };
    }

    // Firestore DocumentReference (Admin SDK)
    if (obj.id && obj.path && obj.firestore) {
        return { _type: 'reference', path: obj.path };
    }

    if (obj._seconds !== undefined && obj._nanoseconds !== undefined) {
        return { _type: 'timestamp', value: new Date(obj._seconds * 1000).toISOString() };
    }

    seen.add(obj);

    if (Array.isArray(obj)) {
        return obj.map(item => convertTimestamps(item, seen));
    }

    const converted = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            converted[key] = convertTimestamps(obj[key], seen);
        }
    }
    return converted;
}

async function exportAllData() {
    console.log('='.repeat(60));
    console.log('🔥 FIRESTORE DATA EXPORT');
    console.log('='.repeat(60));
    console.log(`📅 Export started at: ${new Date().toISOString()}`);
    console.log('');

    const exportData = {
        metadata: {
            exportedAt: new Date().toISOString(),
            firebase: {
                projectId: projectId || 'unknown'
            },
            version: '1.0.0'
        },
        collections: {}
    };

    let totalDocuments = 0;

    for (const collectionName of COLLECTIONS_TO_EXPORT) {
        const result = await exportCollection(collectionName);
        exportData.collections[collectionName] = {
            documents: result.documents,
            count: result.count,
            ...(result.error && { error: result.error })
        };
        totalDocuments += result.count;
    }

    // Write to file
    const outputPath = path.join(__dirname, '..', 'firestore_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 EXPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Total documents exported: ${totalDocuments}`);
    console.log(`📁 Output file: ${outputPath}`);
    console.log(`📏 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
    console.log('');
    console.log('💡 To import this data to a new Firebase project:');
    console.log('   1. Update serviceAccountKey.json with new project credentials');
    console.log('   2. Run: node scripts/import-firestore-data.js');
    console.log('');

    process.exit(0);
}

// Run export
exportAllData().catch(error => {
    console.error('❌ Export failed:', error);
    process.exit(1);
});
