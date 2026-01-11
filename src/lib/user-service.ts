import { auth, db } from '@/lib/firebase';
import { 
  signOut,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { User, Student, Driver, Moderator } from '@/lib/types';

// Export types from the new types file
export type { User, Student, Driver, Moderator } from '@/lib/types';
export type UserRole = 'admin' | 'moderator' | 'driver' | 'student';

// Function to sign in a user with Google
export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Check if user already exists in users collection by email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', user.email || ''));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      // User exists, get their document
      const userDoc = querySnapshot.docs[0];
      const oldDocId = userDoc.id;
      const userData = userDoc.data();
      
      // Update their uid and lastLoginAt
      const updatedData = {
        ...userData,
        uid: user.uid,
        lastLoginAt: Timestamp.now()
      };
      
      // If the document ID is not the Firebase Auth UID, we need to:
      // 1. Create a new document with the correct UID
      // 2. Delete the old document
      if (oldDocId !== user.uid) {
        // Create new document with Firebase Auth UID
        const newUserDocRef = doc(db, 'users', user.uid);
        await setDoc(newUserDocRef, updatedData);
        
        // Delete old document
        const oldUserDocRef = doc(db, 'users', oldDocId);
        await deleteDoc(oldUserDocRef);
        
        // Also update the role-specific document if it exists
        const roleCollection = userData.role + 's'; // students, drivers, moderators
        const oldRoleDocRef = doc(db, roleCollection, oldDocId);
        const roleDoc = await getDoc(oldRoleDocRef);
        
        if (roleDoc.exists()) {
          // Create new role document with Firebase Auth UID
          const newRoleDocRef = doc(db, 'users', user.uid);
          const roleData = {
            ...roleDoc.data(),
            uid: user.uid
          };
          await setDoc(newRoleDocRef, roleData);
          
          // Delete old role document
          await deleteDoc(oldRoleDocRef);
        }
      } else {
        // Document ID already matches Firebase Auth UID, just update
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          uid: user.uid,
          lastLoginAt: Timestamp.now()
        });
      }
      
      return { success: true, user };
    }
    
    // User not found in users collection
    // Create an entry in unauthUsers collection for tracking
    try {
      console.log('🔄 Creating unauth-users document for new user:', user.email);
      const token = await user.getIdToken();
      console.log('🔑 Got ID token for unauth-user creation');
      
      const response = await fetch('/api/unauth-users/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Unauth-user API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ UnauthUser entry created/updated:', data);
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to create unauthUser entry:', errorData);
        console.error('Response status:', response.status);
        console.error('Response headers:', Object.fromEntries(response.headers.entries()));
      }
    } catch (unauthError: any) {
      // Log but don't fail - user can still proceed to application
      console.error('❌ Could not create unauthUser entry:', unauthError);
      console.error('Error details:', {
        name: unauthError?.name,
        message: unauthError?.message,
        stack: unauthError?.stack
      });
    }
    
    // Instead of showing an error, we'll indicate that the user needs to apply
    return { success: true, user, needsApplication: true };
  } catch (error: any) {
    // List of error codes that are expected user behavior (not actual errors)
    const expectedUserCancellations = [
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/popup-blocked'
    ];
    
    // Only log unexpected errors (exclude permission errors and user cancellations)
    if (!error.message?.includes('permission') && 
        error.code !== 'permission-denied' &&
        !expectedUserCancellations.includes(error.code)) {
      console.error('Error signing in with Google:', error);
    }
    
    // Handle specific Firebase errors
    if (error.code === 'auth/popup-closed-by-user') {
      // User closed the popup without signing in - this is normal behavior
      console.log('ℹ️ User closed sign-in popup');
      return { success: false, error: 'Sign in was cancelled' };
    } else if (error.code === 'auth/cancelled-popup-request') {
      // Another popup request cancelled this one - this can be ignored
      console.log('ℹ️ Sign-in popup was cancelled by another request');
      return { success: false, error: 'Sign in was cancelled' };
    } else if (error.code === 'auth/popup-blocked') {
      // Popup was blocked by the browser
      console.warn('⚠️ Sign-in popup was blocked by browser');
      return { success: false, error: 'Popup was blocked. Please allow popups for this site and try again.' };
    } else if (error.code === 'auth/network-request-failed') {
      // Network error
      console.warn('⚠️ Network error during sign-in');
      return { success: false, error: 'Network error. Please check your connection and try again.' };
    }
    
    // For all other errors, return the error message
    return { success: false, error: error.message || 'An error occurred during sign in' };
  }
}

// Function to sign in a user (Google-only)
export async function signInUser() {
  return signInWithGoogle();
}

// Function to sign out a user
export async function signOutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Function to get user data from Firestore
export async function getUserData(uid: string): Promise<User | null> {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
    
    // If user document doesn't exist, this might be a newly created user
    // Return null to indicate no user data found
    return null;
  } catch (error: any) {
    // Handle permission errors silently - these are EXPECTED for new users
    if (error.code === 'permission-denied' || 
        error.message?.includes("Missing or insufficient permissions") ||
        error.message?.includes("permission")) {
      // This is normal for new users who haven't been approved yet
      // Return null without logging to avoid confusion
      return null;
    }
    
    // Only log truly unexpected errors
    console.error('Unexpected error fetching user data:', error);
    return null;
  }
}

// Function to get all users of a specific role
export async function getUsersByRole(role: UserRole): Promise<User[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', role));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as User);
  } catch (error) {
    console.error(`Error fetching ${role}s:`, error);
    return [];
  }
}

// Function to update user data
export async function updateUserData(uid: string, data: Partial<User>) {
  try {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, data, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('Error updating user data:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Function to delete a user from Firebase Authentication and Firestore
export async function deleteUser(uid: string) {
  try {
    const response = await fetch('/api/delete-user', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete user');
    }
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete user');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting user:', error);
    return { success: false, error: (error as Error).message };
  }
}