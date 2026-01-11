import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';

// Helper function to read JSON files
const readJsonFile = (filename: string) => {
  const filePath = path.join(process.cwd(), 'src', 'data', filename);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContents);
};

export async function GET() {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    console.log('Starting data migration to Firestore...');
    
    // Read combined buses data
    const busesData = readJsonFile('BUSES.json');
    console.log(`Read ${busesData.length} buses from BUSES.json`);
    
    // Clear existing buses collection
    console.log('Clearing existing buses collection...');
    const busesSnapshot = await db.collection('buses').get();
    if (busesSnapshot.size > 0) {
      const busBatch = db.batch();
      busesSnapshot.docs.forEach((doc: any) => {
        busBatch.delete(db.collection('buses').doc(doc.id));
      });
      await busBatch.commit();
      console.log(`Cleared ${busesSnapshot.size} existing buses`);
    } else {
      console.log('No existing buses to clear');
    }
    
    // Add new buses data
    console.log('Adding new buses data...');
    for (const bus of busesData) {
      // Add createdAt and updatedAt fields if not present
      const busWithTimestamps = {
        ...bus,
        createdAt: bus.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await db.collection('buses').doc(bus.busId).set(busWithTimestamps);
      console.log(`Added bus: ${bus.busNumber}`);
    }
    
    console.log(`Successfully migrated ${busesData.length} buses to Firestore`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully migrated ${busesData.length} buses to Firestore` 
    });
  } catch (error: any) {
    console.error('Error during migration:', error);
    return NextResponse.json({ error: error.message || 'Failed to migrate data' }, { status: 500 });
  }
}