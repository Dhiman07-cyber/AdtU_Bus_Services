/**
 * Migration Script: Single fcmToken field → tokens subcollection
 * 
 * MIGRATES STUDENTS ONLY - FCM tokens should only be registered for students
 * Reads students/{uid}.fcmToken and creates:
 *   students/{uid}/tokens/{sha256(token)} { token, platform, lastSeen, valid }
 * 
 * After subcollection write, clears the legacy fcmToken field.
 * 
 * Usage:
 *   npx tsx scripts/migrate-fcm-tokens.ts            # dry-run
 *   npx tsx scripts/migrate-fcm-tokens.ts --execute   # live run
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

// ─── Firebase Admin Init ─────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length) return getFirestore(getApps()[0]);

  const requiredVars = ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  for (const key of requiredVars) {
    if (!process.env[key]) {
      console.error(`❌ Missing env var: ${key}`);
      process.exit(1);
    }
  }

  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

  const app = initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  return getFirestore(app);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = !process.argv.includes('--execute');
  const db = initFirebase();

  console.log(`\n🔄 FCM Token Migration ${dryRun ? '(DRY RUN)' : '(LIVE EXECUTION)'}`);
  console.log('─'.repeat(60));

  const collections = ['students']; // Only migrate students - FCM tokens are for students only
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const collectionName of collections) {
    console.log(`\n📂 Scanning ${collectionName}...`);
    const snapshot = await db.collection(collectionName).get();

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const fcmToken = data?.fcmToken;

      if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.length < 10) {
        skipped++;
        continue;
      }

      const tokenHash = hashToken(fcmToken);
      const tokenDocRef = db
        .collection(collectionName)
        .doc(doc.id)
        .collection('tokens')
        .doc(tokenHash);

      try {
        // Check if already migrated
        const existing = await tokenDocRef.get();
        if (existing.exists) {
          console.log(`  ⏭️ ${doc.id}: already migrated (${tokenHash.slice(0, 8)}...)`);
          skipped++;
          continue;
        }

        if (dryRun) {
          console.log(`  📋 ${doc.id}: would migrate token (${tokenHash.slice(0, 8)}...)`);
          migrated++;
        } else {
          // Write to subcollection
          await tokenDocRef.set({
            token: fcmToken,
            platform: data.fcmPlatform || 'web',
            lastSeen: FieldValue.serverTimestamp(),
            valid: true,
          });

          // Clear legacy field
          await db.collection(collectionName).doc(doc.id).update({
            fcmToken: FieldValue.delete(),
            fcmPlatform: FieldValue.delete(),
            fcmUpdatedAt: FieldValue.delete(),
          });

          console.log(`  ✅ ${doc.id}: migrated (${tokenHash.slice(0, 8)}...)`);
          migrated++;
        }
      } catch (error: any) {
        console.error(`  ❌ ${doc.id}: ${error.message}`);
        errors++;
      }
    }

    console.log(`  📊 ${collectionName}: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
    totalMigrated += migrated;
    totalSkipped += skipped;
    totalErrors += errors;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅ Migration ${dryRun ? '(DRY RUN) ' : ''}complete:`);
  console.log(`   Migrated: ${totalMigrated}`);
  console.log(`   Skipped:  ${totalSkipped}`);
  console.log(`   Errors:   ${totalErrors}`);

  if (dryRun) {
    console.log('\n⚠️  Run with --execute to apply changes.');
  }
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
