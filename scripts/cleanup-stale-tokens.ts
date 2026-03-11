/**
 * Cleanup Script: Remove stale FCM tokens
 * 
 * Scans all students (and drivers) for tokens where
 * `lastSeen` is older than N days. Deletes those token docs.
 * 
 * Usage:
 *   npx tsx scripts/cleanup-stale-tokens.ts              # dry-run, 30 days
 *   npx tsx scripts/cleanup-stale-tokens.ts --execute     # live run, 30 days
 *   npx tsx scripts/cleanup-stale-tokens.ts --days=60     # 60 day threshold
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = !process.argv.includes('--execute');
  const daysArg = process.argv.find(a => a.startsWith('--days='));
  const maxAgeDays = daysArg ? parseInt(daysArg.split('=')[1], 10) : 30;

  const db = initFirebase();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  console.log(`\n🧹 Token Cleanup ${dryRun ? '(DRY RUN)' : '(LIVE EXECUTION)'}`);
  console.log(`   Max age: ${maxAgeDays} days (before ${cutoff.toISOString()})`);
  console.log('─'.repeat(60));

  const collections = ['students', 'drivers'];
  let totalScanned = 0;
  let totalDeleted = 0;
  let totalKept = 0;

  for (const collectionName of collections) {
    console.log(`\n📂 Scanning ${collectionName}...`);
    const snapshot = await db.collection(collectionName).get();

    let scanned = 0;
    let deleted = 0;
    let kept = 0;

    for (const userDoc of snapshot.docs) {
      const tokensSnap = await userDoc.ref.collection('tokens').get();

      for (const tokenDoc of tokensSnap.docs) {
        scanned++;
        const data = tokenDoc.data();
        const lastSeen = data?.lastSeen;

        let lastSeenDate: Date | null = null;
        if (lastSeen && typeof lastSeen.toDate === 'function') {
          lastSeenDate = lastSeen.toDate();
        } else if (lastSeen && typeof lastSeen === 'string') {
          lastSeenDate = new Date(lastSeen);
        }

        if (lastSeenDate && lastSeenDate < cutoff) {
          if (dryRun) {
            console.log(`  📋 Would delete: ${userDoc.id}/${tokenDoc.id} (lastSeen: ${lastSeenDate.toISOString()})`);
          } else {
            await tokenDoc.ref.delete();
            console.log(`  🗑️ Deleted: ${userDoc.id}/${tokenDoc.id} (lastSeen: ${lastSeenDate.toISOString()})`);
          }
          deleted++;
        } else {
          kept++;
        }
      }
    }

    console.log(`  📊 ${collectionName}: ${scanned} scanned, ${deleted} ${dryRun ? 'would delete' : 'deleted'}, ${kept} kept`);
    totalScanned += scanned;
    totalDeleted += deleted;
    totalKept += kept;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅ Cleanup ${dryRun ? '(DRY RUN) ' : ''}complete:`);
  console.log(`   Scanned: ${totalScanned}`);
  console.log(`   ${dryRun ? 'Would delete' : 'Deleted'}: ${totalDeleted}`);
  console.log(`   Kept:    ${totalKept}`);

  if (dryRun) {
    console.log('\n⚠️  Run with --execute to apply changes.');
  }
}

main().catch(error => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
