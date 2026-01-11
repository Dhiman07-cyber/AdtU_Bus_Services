import { NextResponse } from 'next/server';

export async function GET() {
  // Log environment variables for debugging
  console.log('=== Environment Variables Debug ===');
  console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
  console.log('FIREBASE_PRIVATE_KEY length:', process.env.FIREBASE_PRIVATE_KEY?.length);
  console.log('FIREBASE_PRIVATE_KEY preview:', process.env.FIREBASE_PRIVATE_KEY?.substring(0, 100));
  console.log('NEXT_PUBLIC_FIREBASE_PROJECT_ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  
  // Test the private key replacement
  const originalKey = process.env.FIREBASE_PRIVATE_KEY;
  const replacedKey = originalKey?.replace(/\\n/g, '\n');
  
  console.log('Original key length:', originalKey?.length);
  console.log('Replaced key length:', replacedKey?.length);
  console.log('Keys are equal:', originalKey === replacedKey);
  
  // Check if the key starts and ends correctly
  console.log('Original key starts with BEGIN:', originalKey?.startsWith('-----BEGIN PRIVATE KEY-----'));
  console.log('Original key ends with END:', originalKey?.endsWith('-----END PRIVATE KEY-----\n'));
  console.log('Replaced key starts with BEGIN:', replacedKey?.startsWith('-----BEGIN PRIVATE KEY-----'));
  console.log('Replaced key ends with END:', replacedKey?.endsWith('-----END PRIVATE KEY-----\n'));
  
  return NextResponse.json({
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY_LENGTH: process.env.FIREBASE_PRIVATE_KEY?.length,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}