import { adminDb } from './firebase-admin';

const DEFAULT_BATCH_SIZE = 1000;

export async function iterateAllDocs(
  query: FirebaseFirestore.Query,
  onBatch: (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => Promise<void>,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<void> {
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let hasMore = true;

  while (hasMore) {
    let batchQuery = query.limit(batchSize);
    if (lastDoc) {
      batchQuery = batchQuery.startAfter(lastDoc);
    }

    const snapshot = await batchQuery.get();
    const docs = snapshot.docs;

    if (docs.length === 0) {
      hasMore = false;
    } else {
      await onBatch(docs);
      lastDoc = docs[docs.length - 1];

      if (docs.length < batchSize) {
        hasMore = false;
      }
    }
  }
}

export async function collectAllDocs<T>(
  query: FirebaseFirestore.Query,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<T[]> {
  const allDocs: T[] = [];

  await iterateAllDocs(
    query,
    async (docs) => {
      for (const doc of docs) {
        allDocs.push({ id: doc.id, ...doc.data() } as T);
      }
    },
    batchSize
  );

  return allDocs;
}

export async function collectAllSnapshots(
  query: FirebaseFirestore.Query,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  await iterateAllDocs(
    query,
    async (docs) => {
      allDocs.push(...docs);
    },
    batchSize
  );

  return allDocs;
}
