import { NextResponse } from 'next/server';
import { initFirestoreData } from '@/lib/init-firestore-data';

export async function POST() {
  try {
    console.log('Initializing Firestore data via API endpoint...');
    
    // Add a delay to ensure Firebase is initialized
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const success = await initFirestoreData();
    
    if (success) {
      return NextResponse.json({ 
        success: true, 
        message: 'Firestore data initialized successfully' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to initialize Firestore data' 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in init-firestore-data API:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}