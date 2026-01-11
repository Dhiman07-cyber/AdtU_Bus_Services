import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let adminApp: any;
let auth: any;
let db: any;
let useAdminSDK = false;

// Get the data directory path
const dataDirectory = path.join(process.cwd(), 'src', 'data');

// Helper function to read JSON files
const readJsonFile = (filename: string) => {
  const filePath = path.join(dataDirectory, filename);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContents);
};

// Helper function to write JSON files
const writeJsonFile = (filename: string, data: any) => {
  const filePath = path.join(dataDirectory, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// Try to initialize Firebase Admin SDK
try {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      // Fix private key parsing issue
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      adminApp = initializeApp({
        credential: require('firebase-admin').cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      adminApp = getApps()[0];
    }

    auth = getAuth(adminApp);
    db = getFirestore(adminApp);
    useAdminSDK = true;
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK, falling back to client SDK:', error);
  useAdminSDK = false;
}

export async function POST(request: Request) {
  try {
    const userData = await request.json();
    console.log('Received user data:', userData);
    
    const { 
      email, 
      name, 
      role, 
      phone, 
      alternatePhone, 
      profilePhotoUrl,
      enrollmentId,
      gender,
      age,
      faculty,
      department,
      parentName,
      parentPhone,
      dob,
      licenseNumber,
      joiningDate,
      assignedFaculty,
      permissions,
      aadharNumber,
      routeId, // Add routeId
      busAssigned // Add busAssigned
    } = userData;
    
    // Validate required input
    if (!email || !name || !role) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Email, name, and role are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Validate profile photo URL if provided
    if (profilePhotoUrl && typeof profilePhotoUrl !== 'string') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Profile photo URL must be a string' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (useAdminSDK && auth && db) {
      // Use Firebase Admin SDK
      try {
        // For Google authentication, we don't create users with email/password
        // Instead, we check if the user already exists in Firebase Auth
        let uid: string;
        try {
          const userRecord = await auth.getUserByEmail(email);
          uid = userRecord.uid;
          console.log('Found existing Firebase user with UID:', uid);
        } catch (error: any) {
          if (error.code === 'auth/user-not-found') {
            // User doesn't exist, this shouldn't happen with Google auth flow
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'User must sign in with Google first before being added to the system' 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          } else {
            throw error;
          }
        }
        
        // Prepare user data for Firestore based on role
        const baseUserData = {
          uid,
          email,
          name,
          role,
          phone: phone || null,
          alternatePhone: alternatePhone || null,
          profilePhotoUrl: profilePhotoUrl || null,
          createdAt: new Date().toISOString(),
          routeId: routeId || null, // Add routeId to base user data
        };
        
        let firestoreUserData: any = { ...baseUserData };
        
        // Add role-specific fields
        if (role === 'student') {
          firestoreUserData = {
            ...firestoreUserData,
            enrollmentId: enrollmentId || null,
            gender: gender || null,
            age: age ? parseInt(age) : null,
            faculty: faculty || null,
            department: department || null,
            parentName: parentName || null,
            parentPhone: parentPhone || null,
            waitingFlag: false,
            busAssigned: busAssigned || null, // Add busAssigned for students
          };
        } else if (role === 'driver') {
          firestoreUserData = {
            ...firestoreUserData,
            dob: dob || null,
            licenseNumber: licenseNumber || null,
            joiningDate: joiningDate || null,
            assignedBus: busAssigned || null, // Add assignedBus for drivers
          };
        } else if (role === 'moderator') {
          firestoreUserData = {
            ...firestoreUserData,
            dob: dob || null,
            assignedFaculty: assignedFaculty || null,
            permissions: permissions ? permissions.split(',').map((p: string) => p.trim()) : [],
            joiningDate: joiningDate || null,
            aadharNumber: aadharNumber || null,
            phone: phone || null,
            alternatePhone: alternatePhone || null,
          };
        }
        
        // Create user document in Firestore
        await db.collection('users').doc(uid).set(firestoreUserData);
        console.log('Saved user data to Firestore');
        
        // Also save to local JSON files
        try {
          if (role === 'student') {
            const students = readJsonFile('Students.json');
            console.log('Current students in JSON file:', students);
            
            const newStudent = {
              id: uid,
              name,
              email,
              faculty: faculty || '',
              department: department || '',
              busAssigned: busAssigned || '',
              routeId: routeId || '',
              ...firestoreUserData
            };
            students.push(newStudent);
            writeJsonFile('Students.json', students);
            console.log('Saved student to JSON file:', newStudent);
          } else if (role === 'driver') {
            const drivers = readJsonFile('Drivers.json');
            const newDriver = {
              id: uid,
              name,
              email,
              licenseNumber: licenseNumber || '',
              busAssigned: busAssigned || '',
              routeId: routeId || '',
              ...firestoreUserData
            };
            drivers.push(newDriver);
            writeJsonFile('Drivers.json', drivers);
          } else if (role === 'moderator') {
            const moderators = readJsonFile('Moderators.json');
            const newModerator = {
              id: uid,
              name,
              email,
              faculty: assignedFaculty || '',
              joinDate: joiningDate || '',
              aadharNumber: aadharNumber || '',
              phone: phone || '',
              alternatePhone: alternatePhone || '',
              ...firestoreUserData
            };
            moderators.push(newModerator);
            writeJsonFile('Moderators.json', moderators);
          }
        } catch (jsonError) {
          console.error('Error saving to JSON files:', jsonError);
          // Continue even if JSON saving fails
        }
        
        return new Response(JSON.stringify({ success: true, uid }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        // Fall back to client SDK
        useAdminSDK = false;
      }
    }
    
    // Fallback to client SDK
    if (!useAdminSDK) {
      console.log('Falling back to client SDK');
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getAuth } = await import('firebase/auth');
      const { getFirestore, doc, setDoc } = await import('firebase/firestore');
      
      // Firebase configuration
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };
      
      // Initialize Firebase
      const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      const clientAuth = getAuth(app);
      const clientDb = getFirestore(app);
      
      try {
        // For Google authentication, we don't create users with email/password
        // Instead, we check if the user already exists in Firebase Auth
        // This is a simplified check - in a real implementation, you'd verify the user
        // has signed in with Google and has a valid ID token
        
        // In this implementation, we'll assume the user exists and use their email
        // to generate a UID (in a real app, you'd get this from the Firebase Auth token)
        const uid = `uid_${Date.now()}`; // Placeholder - in real app, get from Firebase Auth
        
        // Prepare user data for Firestore based on role
        const baseUserData = {
          uid,
          email,
          name,
          role,
          phone: phone || null,
          alternatePhone: alternatePhone || null,
          profilePhotoUrl: profilePhotoUrl || null,
          createdAt: new Date().toISOString(),
          routeId: routeId || null, // Add routeId to base user data
        };
        
        let firestoreUserData: any = { ...baseUserData };
        
        // Add role-specific fields
        if (role === 'student') {
          firestoreUserData = {
            ...firestoreUserData,
            enrollmentId: enrollmentId || null,
            gender: gender || null,
            age: age ? parseInt(age) : null,
            faculty: faculty || null,
            department: department || null,
            parentName: parentName || null,
            parentPhone: parentPhone || null,
            waitingFlag: false,
            busAssigned: busAssigned || null, // Add busAssigned for students
          };
        } else if (role === 'driver') {
          firestoreUserData = {
            ...firestoreUserData,
            dob: dob || null,
            licenseNumber: licenseNumber || null,
            joiningDate: joiningDate || null,
            assignedBus: busAssigned || null, // Add assignedBus for drivers
          };
        } else if (role === 'moderator') {
          firestoreUserData = {
            ...firestoreUserData,
            dob: dob || null,
            assignedFaculty: assignedFaculty || null,
            permissions: permissions ? permissions.split(',').map((p: string) => p.trim()) : [],
            joiningDate: joiningDate || null,
            aadharNumber: aadharNumber || null,
            phone: phone || null,
            alternatePhone: alternatePhone || null,
          };
        }
        
        // Create user document in Firestore
        const userDocRef = doc(clientDb, 'users', uid);
        await setDoc(userDocRef, firestoreUserData);
        console.log('Saved user data to Firestore (client SDK)');
        
        // Also save to local JSON files
        try {
          if (role === 'student') {
            const students = readJsonFile('Students.json');
            console.log('Current students in JSON file (client SDK):', students);
            
            const newStudent = {
              id: uid,
              name,
              email,
              faculty: faculty || '',
              department: department || '',
              busAssigned: busAssigned || '',
              routeId: routeId || '',
              ...firestoreUserData
            };
            students.push(newStudent);
            writeJsonFile('Students.json', students);
            console.log('Saved student to JSON file (client SDK):', newStudent);
          } else if (role === 'driver') {
            const drivers = readJsonFile('Drivers.json');
            const newDriver = {
              id: uid,
              name,
              email,
              licenseNumber: licenseNumber || '',
              busAssigned: busAssigned || '',
              routeId: routeId || '',
              ...firestoreUserData
            };
            drivers.push(newDriver);
            writeJsonFile('Drivers.json', drivers);
          } else if (role === 'moderator') {
            const moderators = readJsonFile('Moderators.json');
            const newModerator = {
              id: uid,
              name,
              email,
              faculty: assignedFaculty || '',
              joinDate: joiningDate || '',
              aadharNumber: aadharNumber || '',
              phone: phone || '',
              alternatePhone: alternatePhone || '',
              ...firestoreUserData
            };
            moderators.push(newModerator);
            writeJsonFile('Moderators.json', moderators);
          }
        } catch (jsonError) {
          console.error('Error saving to JSON files (client SDK):', jsonError);
          // Continue even if JSON saving fails
        }
        
        return new Response(JSON.stringify({ success: true, uid }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (clientError: any) {
        console.error('Error with Client SDK:', clientError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: clientError.message || 'Failed to create user with client SDK' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  } catch (error: any) {
    console.error('Error creating user:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to create user' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}