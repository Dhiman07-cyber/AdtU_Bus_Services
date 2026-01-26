"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, getDoc, Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { setSigningOut, getSigningOutState } from '@/lib/firestore-error-handler';
import { User, signInWithGoogle } from '@/lib/user-service';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  needsApplication: boolean;
  isExpired: boolean; // Derived from validUntil - no Firestore writes!
  signInWithGoogle: () => Promise<{ success: boolean; error?: string; user?: FirebaseUser; needsApplication?: boolean }>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Local storage keys
const CACHE_KEY = 'adtu_bus_user_data';
const CACHE_EXPIRY_KEY = 'adtu_bus_cache_expiry';

// Cache duration: 5 minutes - balanced for real-time updates while reducing Firestore reads
// Real-time listeners will still update immediately when data changes
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached user data from localStorage
 * Used for instant UI on page load; real-time listeners update afterwards
 */
function getCachedUserData(): User | null {
  try {
    if (typeof window === 'undefined') return null;

    const cached = localStorage.getItem(CACHE_KEY);
    const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);

    if (!cached || !expiry) return null;

    // Check if cache is expired
    if (Date.now() > parseInt(expiry)) {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      return null;
    }

    return JSON.parse(cached);
  } catch (error) {
    console.warn('Failed to read cache:', error);
    return null;
  }
}

/**
 * Save user data to localStorage cache
 */
function setCachedUserData(data: User | null): void {
  try {
    if (data) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION).toString());
    } else {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
    }
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
}

/**
 * Check if service is expired based on validUntil
 * This is a FRONTEND-ONLY check - no Firestore writes!
 */
function checkIfExpired(validUntil: any): boolean {
  if (!validUntil) {
    console.log('🔴 checkIfExpired: validUntil is null/undefined');
    return true;
  }

  try {
    console.log('🔍 checkIfExpired received:', {
      value: validUntil,
      type: typeof validUntil,
      hasToDate: validUntil?.toDate !== undefined,
      hasSeconds: validUntil?.seconds !== undefined,
      isDate: validUntil instanceof Date
    });

    let expiryDate: Date;

    // Handle Firestore Timestamp
    if (validUntil?.toDate && typeof validUntil.toDate === 'function') {
      expiryDate = validUntil.toDate();
      console.log('✅ Parsed as Firestore Timestamp:', expiryDate);
    }
    // Handle Firebase Timestamp seconds/nanoseconds
    else if (validUntil?.seconds) {
      expiryDate = new Date(validUntil.seconds * 1000);
      console.log('✅ Parsed as seconds:', expiryDate);
    }
    // Handle Date object
    else if (validUntil instanceof Date) {
      expiryDate = validUntil;
      console.log('✅ Already a Date:', expiryDate);
    }
    // Handle string
    else if (typeof validUntil === 'string') {
      expiryDate = new Date(validUntil);
      console.log('✅ Parsed from string:', expiryDate);
    }
    else {
      console.error('❌ Unknown validUntil format:', validUntil);
      return true;
    }

    const now = new Date();
    const isExpired = expiryDate < now;
    console.log(`📅 Date comparison: ${expiryDate.toISOString()} < ${now.toISOString()} = ${isExpired}`);

    return isExpired;
  } catch (error) {
    console.error('❌ Error parsing validUntil:', error);
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsApplication, setNeedsApplication] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const listenerUnsubscribe = useRef<Unsubscribe | null>(null);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (listenerUnsubscribe.current) {
        listenerUnsubscribe.current();
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;

      console.log('🔄 Auth state changed:', {
        hasUser: !!user,
        uid: user?.uid,
        email: user?.email
      });

      setCurrentUser(user);

      if (user) {
        // Step 1: Try to load from cache first (INSTANT UI)
        const cachedData = getCachedUserData();
        if (cachedData && cachedData.uid === user.uid) {
          console.log('✅ Loaded user from cache');
          setUserData(cachedData);
          setNeedsApplication(false);
          // Only check expiration for students (they have validUntil field)
          if (cachedData.role === 'student') {
            setIsExpired(checkIfExpired(cachedData.validUntil));
          } else {
            // Non-student users (admin, moderator, driver) are never expired
            setIsExpired(false);
          }
          setLoading(false); // Show UI immediately with cached data
        }

        // Step 2: Set up realtime listener for this user
        try {
          // Clean up previous listener if exists
          if (listenerUnsubscribe.current) {
            listenerUnsubscribe.current();
          }

          // First, check which collection to use based on role
          // Priority: students collection for student role (has validUntil)
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          let targetCollection = 'users';
          let userDocData = null;

          if (userDocSnap.exists()) {
            userDocData = userDocSnap.data();
            console.log(`👤 Found user in users collection with role: ${userDocData?.role}`);

            // Immediately set needsApplication to false since user exists
            setNeedsApplication(false);

            if (userDocData?.role === 'student') {
              // Student role MUST use students collection for full data
              targetCollection = 'students';
              console.log(`🔄 Switching to students collection for student role`);
            } else if (userDocData?.role === 'driver') {
              // Driver role MUST use drivers collection for full data
              targetCollection = 'drivers';
              console.log(`🔄 Switching to drivers collection for driver role`);
            } else if (userDocData?.role === 'moderator') {
              // Moderator role MUST use moderators collection for full data
              targetCollection = 'moderators';
              console.log(`🔄 Switching to moderators collection for moderator role`);
            } else if (userDocData?.role === 'admin') {
              // Admin role MUST use admins collection for full data
              targetCollection = 'admins';
              console.log(`🔄 Switching to admins collection for admin role`);
            }
          } else {
            // Not in users collection, try students collection directly
            console.log(`⚠️ User not found in users collection, checking students...`);
            const studentDocRef = doc(db, 'students', user.uid);
            const studentDocSnap = await getDoc(studentDocRef);
            if (studentDocSnap.exists()) {
              targetCollection = 'students';
              setNeedsApplication(false);
              console.log(`✅ Found student in students collection`);
            } else {
              console.log(`❌ User not found in either collection`);
              setNeedsApplication(true);
            }
          }

          // Set up listener on the correct collection
          console.log(`🔍 Setting up listener on ${targetCollection} for user ${user.uid}`);
          const docRef = doc(db, targetCollection, user.uid);

          listenerUnsubscribe.current = onSnapshot(
            docRef,
            (docSnapshot) => {
              if (!isMounted) return;

              if (docSnapshot.exists()) {
                const data = {
                  uid: docSnapshot.id,
                  role: userDocData?.role || (targetCollection.slice(0, -1) as any),
                  ...docSnapshot.data()
                } as User;

                console.log(`📡 Realtime update from ${targetCollection}:`, data.fullName || data.name);

                // Update state and cache
                setUserData(data);
                setCachedUserData(data);
                setNeedsApplication(false);

                // Only check expiration for students (they have validUntil field)
                if (data.role === 'student') {
                  setIsExpired(checkIfExpired(data.validUntil));
                } else {
                  // Non-student users (admin, moderator, driver) are never expired
                  setIsExpired(false);
                }
                setLoading(false);
              } else {
                // Document doesn't exist in target collection
                // For students, this means they need to apply
                console.log(`❌ User document not found in ${targetCollection}`);

                // Only set needsApplication if we're SURE they need to apply
                // Don't redirect if we found them in users but not students (they might be applying)
                if (targetCollection === 'students' && userDocData?.role === 'student') {
                  // They have a user doc with student role but no student doc = need to apply
                  console.warn('⚠️ Student user found but no student document - they need to apply');
                  setUserData(null);
                  setCachedUserData(null);
                  setNeedsApplication(true);
                  setIsExpired(false);
                } else if (!userDocData) {
                  // No user document at all = definitely need to apply
                  console.warn('⚠️ No user document found - they need to apply');
                  setUserData(null);
                  setCachedUserData(null);
                  setNeedsApplication(true);
                  setIsExpired(false);
                }
                setLoading(false);
              }
            },
            (error) => {
              if (!isMounted) return;

              // Check if this error should be suppressed (signout, network issues, etc.)
              if (getSigningOutState()) {
                // Suppress errors during sign-out
                return;
              }

              // Check for permission denied specifically
              const isPermissionError = error.code === 'permission-denied' ||
                error.message?.includes('Missing or insufficient permissions');

              if (isPermissionError) {
                // During active session, permission denied usually means user needs to apply
                // But only if we're not in signout process
                console.warn('Permission denied - user may need to apply');
                setUserData(null);
                setCachedUserData(null);
                setNeedsApplication(true);
                setIsExpired(false);
                setLoading(false);
              } else {
                // Other errors - log but don't immediately assume they need to apply
                // Could be network issues, Firestore service issues, etc.
                console.warn('Listener error (non-permission):', error.message || error.code || 'Unknown error');
                setLoading(false);
              }
            }
          );
        } catch (error: any) {
          if (!isMounted) return;

          console.error('❌ Error setting up user listener:', error);

          // All errors here are treated as "user needs to apply"
          // Permission errors are EXPECTED for new users
          setUserData(null);
          setNeedsApplication(true);
          setIsExpired(false);
          setLoading(false); // CRITICAL: Must set loading to false to prevent infinite redirect!
        }
      } else {
        // No user logged in
        if (listenerUnsubscribe.current) {
          listenerUnsubscribe.current();
          listenerUnsubscribe.current = null;
        }
        setUserData(null);
        setCachedUserData(null);
        setNeedsApplication(false);
        setIsExpired(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogleContext = async () => {
    try {
      const response = await signInWithGoogle();

      if (response.success && response.user) {
        // Check if user needs to apply for service
        if (response.needsApplication) {
          setNeedsApplication(true);
          return { success: true, user: response.user, needsApplication: true };
        }
        // For the first admin, they might not have a user document yet
        // We'll handle this in the calling component
        return { success: true, user: response.user };
      } else {
        // Don't treat "Sign in was cancelled" as an error that should be displayed to the user
        if (response.error === 'Sign in was cancelled') {
          // This is a normal user action, not an error - don't log it
          console.log('User cancelled sign-in process');
          return { success: false };
        }
        return { success: false, error: response.error || 'Sign in failed' };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const signOut = async () => {
    try {
      // Set flag to suppress permission errors during sign-out
      setSigningOut(true);

      // Clean up listener FIRST before any state changes
      if (listenerUnsubscribe.current) {
        try {
          listenerUnsubscribe.current();
        } catch (e) {
          // Ignore listener cleanup errors
        }
        listenerUnsubscribe.current = null;
      }

      // Clear state immediately to prevent any more Firestore operations
      setUserData(null);
      setNeedsApplication(false);
      setIsExpired(false);
      setCurrentUser(null);

      // Clear cache
      setCachedUserData(null);

      // Now sign out from Firebase
      try {
        const { signOutUser } = await import('@/lib/user-service');
        await signOutUser();
      } catch (signOutError) {
        // Even if Firebase signout fails, we've already cleared local state
        console.warn('Firebase signout error (user state already cleared):', signOutError);
      }

      // Reset the flag after a longer delay to allow any pending errors to be suppressed
      setTimeout(() => setSigningOut(false), 2000);

      return { success: true };
    } catch (error) {
      // Reset flag on error
      setTimeout(() => setSigningOut(false), 2000);
      return { success: false, error: (error as Error).message };
    }
  };

  const value = {
    currentUser,
    userData,
    loading,
    needsApplication,
    isExpired,
    signInWithGoogle: signInWithGoogleContext,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}