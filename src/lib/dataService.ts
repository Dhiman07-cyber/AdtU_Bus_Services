import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  Timestamp,
  arrayUnion,
  arrayRemove,
  orderBy
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type {
  User,
  Student,
  Driver,
  Moderator,
  Bus,
  Route,
  Notification,
  Application,
  Invitation
} from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
import {
  getOfflineBusRoutes,
  getOfflineFaculties,
  getOfflineNotifications,
  getOfflineRouteById
} from '@/lib/offline-service';

// Add proper typing for db
import { Firestore } from 'firebase/firestore';

// Helper function to get current timestamp
const getCurrentTimestamp = () => {
  return Timestamp.now();
};

// Determine which database to use based on environment
const getDatabase = async () => {
  // Use admin DB if available (server-side), otherwise use client DB
  if (typeof window === 'undefined') {
    // Server-side - try to use Firebase Admin SDK
    try {
      const { db: adminDb } = await import('@/lib/firebase-admin');
      if (adminDb) {
        return adminDb;
      }
    } catch (error) {
      console.warn('Failed to import Firebase Admin SDK, falling back to client SDK');
    }
  }

  // Client-side or fallback - use Firebase client SDK
  try {
    const { db: clientDb } = await import('@/lib/firebase');
    return clientDb;
  } catch (error) {
    console.error('Failed to import Firebase client SDK');
    throw error;
  }
};

// Helper to check if we can make authenticated calls on client
const checkClientAuth = (): boolean => {
  if (typeof window !== 'undefined') {
    const auth = getAuth();
    if (!auth.currentUser) return false;
  }
  return true;
};

// Get all unique stops from all routes
export const getAllStops = async (): Promise<string[]> => {
  const routes = await getAllRoutes();
  const allStops = routes.flatMap(route => route.stops.map((stop: any) => stop.name));
  return [...new Set(allStops)];
};

// Get all unique bus numbers
export const getAllBusNumbers = async (): Promise<string[]> => {
  const buses = await getAllBuses();
  return buses.map(bus => bus.busNumber);
};

// Get all route names
export const getAllRouteNames = async (): Promise<string[]> => {
  const routes = await getAllRoutes();
  return routes.map(route => route.routeName);
};

// Users collection functions
export const getUserByUid = async (uid: string): Promise<User | null> => {
  try {
    const db = await getDatabase();
    const userDoc = await getDoc(doc(db as Firestore, 'users', uid));
    return userDoc.exists() ? { uid: userDoc.id, ...userDoc.data() } as User : null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

// Enhanced function to get student data from students collection with all details
export const getStudentByUid = async (uid: string): Promise<any | null> => {
  try {
    console.log('🔍 getStudentByUid called with UID:', uid);
    const db = await getDatabase();

    // Strategy 1: Try direct document fetch by UID as document ID
    console.log('📊 Strategy 1: Direct document fetch by UID');
    const studentDoc = await getDoc(doc(db as Firestore, 'students', uid));

    if (studentDoc.exists()) {
      const data = studentDoc.data();
      console.log('📊 Raw student data from students collection:', data);

      // Handle Firestore Timestamps
      const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return null;
        if (timestamp.toDate) {
          return timestamp.toDate().toISOString();
        }
        if (timestamp instanceof Date) {
          return timestamp.toISOString();
        }
        return timestamp;
      };

      // Fetch approver name if approvedById exists
      let approverName = data.approvedBy || '';
      if (data.approvedById) {
        // Try to get moderator first
        const moderator = await getModeratorById(data.approvedById);
        if (moderator) {
          approverName = moderator.fullName || moderator.name || approverName;
        } else {
          // If not a moderator, try to get admin
          const admin = await getAdminById(data.approvedById);
          if (admin) {
            approverName = admin.fullName || admin.name || approverName;
          }
        }
      }

      // Return all student data with proper formatting
      const formattedData = {
        uid: studentDoc.id,
        ...data,
        // Format timestamps
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: formatTimestamp(data.updatedAt),
        approvedAt: formatTimestamp(data.approvedAt),
        validUntil: formatTimestamp(data.validUntil),
        // Ensure payment info is properly structured
        paymentInfo: data.paymentInfo || {},
        // Ensure session history is an array
        sessionHistory: data.sessionHistory || [],
        // Map phone number fields properly
        phoneNumber: data.phoneNumber || data.phone || '',
        // Map name fields properly
        fullName: data.fullName || data.name || '',
        // Map email fields properly
        email: data.email || data.emailAddress || '',
        // Map address fields properly
        address: data.address || data.location || '',
        // Map stop fields properly
        stopId: data.stopId || data.stopName || '',
        // Map bus fields properly
        busId: data.busId || data.assignedBusId || '',
        // Map route fields properly
        routeId: data.routeId || data.assignedRouteId || '',
        // Map shift properly
        shift: data.shift || 'Not Set',
        // Map status properly
        status: data.status || 'pending',
        // Map enrollment ID properly
        enrollmentId: data.enrollmentId || '',
        // Map academic fields properly
        faculty: data.faculty || '',
        department: data.department || '',
        semester: data.semester || '',
        // Map personal fields properly
        gender: data.gender || '',
        bloodGroup: data.bloodGroup || '',
        dob: data.dob || '',
        age: data.age || '',
        // Map parent fields properly
        parentName: data.parentName || '',
        parentPhone: data.parentPhone || '',
        // Map session fields properly
        sessionStartYear: data.sessionStartYear || '',
        sessionEndYear: data.sessionEndYear || '',
        // Map payment fields properly
        paymentAmount: data.paymentAmount || data.paymentInfo?.amountPaid || data.amountPaid || 0,
        paymentVerified: data.paymentInfo?.paymentVerified || data.paymentVerified || false,
        paid_on: data.paid_on,
        // Use approver name instead of email if available
        approvedBy: approverName
      };

      console.log('✅ Formatted student data:', formattedData);
      return formattedData;
    }

    // Strategy 2: Query by UID field in document
    console.log('📊 Strategy 2: Query by UID field');
    const studentsQuery = query(collection(db as Firestore, 'students'), where('uid', '==', uid));
    const studentsSnapshot = await getDocs(studentsQuery);

    console.log('📊 UID query result count:', studentsSnapshot.size);

    if (!studentsSnapshot.empty) {
      const studentDoc = studentsSnapshot.docs[0];
      const data = studentDoc.data();
      console.log('📊 Found student by UID query:', data);

      // Handle Firestore Timestamps
      const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return null;
        if (timestamp.toDate) {
          return timestamp.toDate().toISOString();
        }
        if (timestamp instanceof Date) {
          return timestamp.toISOString();
        }
        return timestamp;
      };

      // Fetch approver name if approvedById exists
      let approverName = data.approvedBy || '';
      if (data.approvedById) {
        // Try to get moderator first
        const moderator = await getModeratorById(data.approvedById);
        if (moderator) {
          approverName = moderator.fullName || moderator.name || approverName;
        } else {
          // If not a moderator, try to get admin
          const admin = await getAdminById(data.approvedById);
          if (admin) {
            approverName = admin.fullName || admin.name || approverName;
          }
        }
      }

      // Return all student data with proper formatting
      const formattedData = {
        uid: studentDoc.id,
        ...data,
        // Format timestamps
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: formatTimestamp(data.updatedAt),
        approvedAt: formatTimestamp(data.approvedAt),
        validUntil: formatTimestamp(data.validUntil),
        // Ensure payment info is properly structured
        paymentInfo: data.paymentInfo || {},
        // Ensure session history is an array
        sessionHistory: data.sessionHistory || [],
        // Map phone number fields properly
        phoneNumber: data.phoneNumber || data.phone || '',
        // Map name fields properly
        fullName: data.fullName || data.name || '',
        // Map email fields properly
        email: data.email || data.emailAddress || '',
        // Map address fields properly
        address: data.address || data.location || '',
        // Map stop fields properly
        stopId: data.stopId || data.stopName || '',
        // Map bus fields properly
        busId: data.busId || data.assignedBusId || '',
        // Map route fields properly
        routeId: data.routeId || data.assignedRouteId || '',
        // Map shift properly
        shift: data.shift || 'Not Set',
        // Map status properly
        status: data.status || 'pending',
        // Map enrollment ID properly
        enrollmentId: data.enrollmentId || '',
        // Map academic fields properly
        faculty: data.faculty || '',
        department: data.department || '',
        semester: data.semester || '',
        // Map personal fields properly
        gender: data.gender || '',
        bloodGroup: data.bloodGroup || '',
        dob: data.dob || '',
        age: data.age || '',
        // Map parent fields properly
        parentName: data.parentName || '',
        parentPhone: data.parentPhone || '',
        // Map session fields properly
        sessionStartYear: data.sessionStartYear || '',
        sessionEndYear: data.sessionEndYear || '',
        // Map payment fields properly
        paymentAmount: data.paymentAmount || data.paymentInfo?.amountPaid || data.amountPaid || 0,
        paymentVerified: data.paymentInfo?.paymentVerified || data.paymentVerified || false,
        paid_on: data.paid_on,
        // Use approver name instead of email if available
        approvedBy: approverName
      };

      console.log('✅ Formatted student data from query:', formattedData);
      return formattedData;
    }

    // Strategy 3: Query by email (for cases where UID doesn't match)
    console.log('📊 Strategy 3: Query by email');
    const userDoc = await getDoc(doc(db as Firestore, 'users', uid));

    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log('📊 User data found, trying to find student by email:', userData.email);

      const emailQuery = query(collection(db as Firestore, 'students'), where('email', '==', userData.email));
      const emailSnapshot = await getDocs(emailQuery);

      console.log('📊 Email query result count:', emailSnapshot.size);

      if (!emailSnapshot.empty) {
        const studentDoc = emailSnapshot.docs[0];
        const data = studentDoc.data();
        console.log('📊 Found student by email query:', data);

        // Handle Firestore Timestamps
        const formatTimestamp = (timestamp: any) => {
          if (!timestamp) return null;
          if (timestamp.toDate) {
            return timestamp.toDate().toISOString();
          }
          if (timestamp instanceof Date) {
            return timestamp.toISOString();
          }
          return timestamp;
        };

        // Fetch approver name if approvedById exists
        let approverName = data.approvedBy || '';
        if (data.approvedById) {
          // Try to get moderator first
          const moderator = await getModeratorById(data.approvedById);
          if (moderator) {
            approverName = moderator.fullName || moderator.name || approverName;
          } else {
            // If not a moderator, try to get admin
            const admin = await getAdminById(data.approvedById);
            if (admin) {
              approverName = admin.fullName || admin.name || approverName;
            }
          }
        }

        // Return all student data with proper formatting
        const formattedData = {
          uid: studentDoc.id,
          ...data,
          // Format timestamps
          createdAt: formatTimestamp(data.createdAt),
          updatedAt: formatTimestamp(data.updatedAt),
          approvedAt: formatTimestamp(data.approvedAt),
          validUntil: formatTimestamp(data.validUntil),
          // Ensure payment info is properly structured
          paymentInfo: data.paymentInfo || {},
          // Ensure session history is an array
          sessionHistory: data.sessionHistory || [],
          // Map phone number fields properly
          phoneNumber: data.phoneNumber || data.phone || '',
          // Map name fields properly
          fullName: data.fullName || data.name || '',
          // Map email fields properly
          email: data.email || data.emailAddress || '',
          // Map address fields properly
          address: data.address || data.location || '',
          // Map stop fields properly
          stopId: data.stopId || data.stopName || '',
          // Map bus fields properly
          busId: data.busId || data.assignedBusId || '',
          // Map route fields properly
          routeId: data.routeId || data.assignedRouteId || '',
          // Map shift properly
          shift: data.shift || 'Not Set',
          // Map status properly
          status: data.status || 'pending',
          // Map enrollment ID properly
          enrollmentId: data.enrollmentId || '',
          // Map academic fields properly
          faculty: data.faculty || '',
          department: data.department || '',
          semester: data.semester || '',
          // Map personal fields properly
          gender: data.gender || '',
          bloodGroup: data.bloodGroup || '',
          dob: data.dob || '',
          age: data.age || '',
          // Map parent fields properly
          parentName: data.parentName || '',
          parentPhone: data.parentPhone || '',
          // Map session fields properly
          sessionStartYear: data.sessionStartYear || '',
          sessionEndYear: data.sessionEndYear || '',
          // Map payment fields properly
          paymentAmount: data.paymentAmount || data.paymentInfo?.amountPaid || data.amountPaid || 0,
          paymentVerified: data.paymentInfo?.paymentVerified || data.paymentVerified || false,
          paid_on: data.paid_on,
          // Use approver name instead of email if available
          approvedBy: approverName
        };

        console.log('✅ Formatted student data from email query:', formattedData);
        return formattedData;
      }
    }

    console.log('❌ Student not found in both students and users collections');

    return null;
  } catch (error) {
    console.error('Error fetching student by UID:', error);
    return null;
  }
};

// Students collection functions
export const getAllStudents = async (): Promise<Student[]> => {
  try {
    const db = await getDatabase();
    const studentsCol = collection(db as Firestore, 'students');
    const studentSnapshot = await getDocs(studentsCol);
    return studentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
  } catch (error) {
    console.error('Error fetching students:', error);
    return [];
  }
};

export const getStudentById = async (id: string): Promise<any | null> => {
  try {
    const db = await getDatabase();
    const studentDoc = await getDoc(doc(db as Firestore, 'students', id));

    if (studentDoc.exists()) {
      const data = studentDoc.data();

      // Handle Firestore Timestamps
      const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return null;
        if (timestamp.toDate) return timestamp.toDate().toISOString();
        if (timestamp instanceof Date) return timestamp.toISOString();
        return timestamp;
      };

      return {
        id: studentDoc.id,
        uid: studentDoc.id,
        ...data,
        // Robust field mapping
        phoneNumber: data.phoneNumber || data.phone || '',
        phone: data.phone || data.phoneNumber || '',
        fullName: data.fullName || data.name || '',
        name: data.name || data.fullName || '',
        email: data.email || data.emailAddress || '',
        address: data.address || data.location || '',
        busId: data.busId || data.assignedBusId || data.busAssigned || '',
        busAssigned: data.busAssigned || data.busId || data.assignedBusId || '',
        routeId: data.routeId || data.assignedRouteId || '',
        assignedRouteId: data.assignedRouteId || data.routeId || '',
        enrollmentId: data.enrollmentId || '',
        pickupPoint: data.pickupPoint || data.stopName || data.stopId || '',
        validUntil: formatTimestamp(data.validUntil),
        createdAt: formatTimestamp(data.createdAt),
        updatedAt: formatTimestamp(data.updatedAt)
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching student:', error);
    return null;
  }
};

export const deleteStudent = async (id: string): Promise<boolean> => {
  try {
    // Get current user for authentication
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.error('No authenticated user found');
      return false;
    }

    // Get ID token for authentication
    const idToken = await currentUser.getIdToken();

    // Call the comprehensive delete API
    const response = await fetch('/api/delete-user', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        uid: id,
        idToken: idToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Delete student API error:', errorData);
      return false;
    }

    const result = await response.json();
    console.log('Student deleted successfully:', result);
    return result.success;
  } catch (error) {
    console.error('Error deleting student:', error);
    return false;
  }
};

export const updateStudent = async (id: string, data: Partial<Student>): Promise<boolean> => {
  try {
    // Get current user for authentication
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.error('No authenticated user found');
      return false;
    }

    // Get ID token for authentication
    const idToken = await currentUser.getIdToken();

    const response = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        uid: id,
        ...data
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Update student API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating student:', error);
    return false;
  }
};

// Drivers collection functions
export const getAllDrivers = async (): Promise<Driver[]> => {
  try {
    const db = await getDatabase();
    const driversCol = collection(db as Firestore, 'drivers');
    const driverSnapshot = await getDocs(driversCol);
    return driverSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return [];
  }
};

export const getDriverById = async (id: string): Promise<any | null> => {
  try {
    const db = await getDatabase();
    const driverDoc = await getDoc(doc(db as Firestore, 'drivers', id));

    if (driverDoc.exists()) {
      const data = driverDoc.data();
      return {
        id: driverDoc.id,
        uid: driverDoc.id,
        ...data,
        // Robust field mapping
        fullName: data.fullName || data.name || '',
        name: data.name || data.fullName || '',
        phone: data.phone || data.phoneNumber || '',
        email: data.email || data.emailAddress || '',
        routeId: data.routeId || data.assignedRouteId || '',
        assignedRouteId: data.assignedRouteId || data.routeId || '',
        busId: data.busId || data.assignedBusId || '',
        assignedBusId: data.assignedBusId || data.busId || '',
        shift: (() => {
          const s = (data.shift || data.assignedShift || '').toLowerCase();
          if (s.includes('morn')) return 'Morning';
          if (s.includes('even')) return 'Evening';
          if (s.includes('both')) return 'Both';
          return '';
        })(),
        employeeId: data.employeeId || data.driverId || ''
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching driver:', error);
    return null;
  }
};

export const deleteDriver = async (id: string): Promise<boolean> => {
  try {
    // Get current user for authentication
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.error('No authenticated user found');
      return false;
    }

    // Get ID token for authentication
    const idToken = await currentUser.getIdToken();

    // Call the comprehensive delete API
    const response = await fetch('/api/delete-user', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        uid: id,
        idToken: idToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Delete driver API error:', errorData);
      return false;
    }

    const result = await response.json();
    console.log('Driver deleted successfully:', result);
    return result.success;
  } catch (error) {
    console.error('Error deleting driver:', error);
    return false;
  }
};

export const updateDriver = async (id: string, data: Partial<Driver>): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await updateDoc(doc(db as Firestore, 'drivers', id), data as any);
    return true;
  } catch (error) {
    console.error('Error updating driver:', error);
    return false;
  }
};

// Moderators collection functions
export const getAllModerators = async (): Promise<Moderator[]> => {
  try {
    const db = await getDatabase();
    const moderatorsCol = collection(db as Firestore, 'moderators');
    const moderatorSnapshot = await getDocs(moderatorsCol);
    return moderatorSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Moderator));
  } catch (error) {
    console.error('Error fetching moderators:', error);
    return [];
  }
};

export const getModeratorById = async (id: string): Promise<Moderator | null> => {
  try {
    const db = await getDatabase();
    const moderatorDoc = await getDoc(doc(db as Firestore, 'moderators', id));
    return moderatorDoc.exists() ? { id: moderatorDoc.id, ...moderatorDoc.data() } as Moderator : null;
  } catch (error: any) {
    // Suppress permission-denied errors (expected for students who can't read moderator profiles)
    if (error?.code !== 'permission-denied') {
      console.error('Error fetching moderator:', error);
    }
    return null;
  }
};

export const getAdminById = async (id: string): Promise<any | null> => {
  try {
    const db = await getDatabase();
    const adminDoc = await getDoc(doc(db as Firestore, 'admins', id));
    return adminDoc.exists() ? { id: adminDoc.id, ...adminDoc.data() } : null;
  } catch (error: any) {
    // Suppress permission-denied errors
    if (error?.code !== 'permission-denied') {
      console.error('Error fetching admin:', error);
    }
    return null;
  }
};

export const deleteModerator = async (id: string): Promise<boolean> => {
  try {
    // Get current user for authentication
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.error('No authenticated user found');
      return false;
    }

    // Get ID token for authentication
    const idToken = await currentUser.getIdToken();

    // Call the comprehensive delete API
    const response = await fetch('/api/delete-user', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        uid: id,
        idToken: idToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Delete moderator API error:', errorData);
      return false;
    }

    const result = await response.json();
    console.log('Moderator deleted successfully:', result);
    return result.success;
  } catch (error) {
    console.error('Error deleting moderator:', error);
    return false;
  }
};

export const updateModerator = async (id: string, data: Partial<Moderator>): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await updateDoc(doc(db as Firestore, 'moderators', id), data as any);
    return true;
  } catch (error) {
    console.error('Error updating moderator:', error);
    return false;
  }
};

// Buses collection functions
export const getAllBuses = async (): Promise<Bus[]> => {
  try {
    if (!checkClientAuth()) return [];

    const db = await getDatabase();
    const busesCol = collection(db as Firestore, 'buses');
    const busSnapshot = await getDocs(busesCol);
    return busSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
  } catch (error) {
    console.error('Error fetching buses:', error);
    return [];
  }
};

export const getBusById = async (id: string): Promise<Bus | null> => {
  try {
    const db = await getDatabase();
    const busDoc = await getDoc(doc(db as Firestore, 'buses', id));
    return busDoc.exists() ? { id: busDoc.id, ...busDoc.data() } as Bus : null;
  } catch (error) {
    console.error('Error fetching bus:', error);
    return null;
  }
};

// Get buses by route ID
export const getBusesByRouteId = async (routeId: string): Promise<Bus[]> => {
  try {
    const db = await getDatabase();
    const busesCol = collection(db as Firestore, 'buses');
    const q = query(busesCol, where('routeId', '==', routeId));
    const busSnapshot = await getDocs(q);
    return busSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
  } catch (error) {
    console.error('Error fetching buses by route ID:', error);
    return [];
  }
};

export const deleteBus = async (id: string): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await deleteDoc(doc(db as Firestore, 'buses', id));
    return true;
  } catch (error) {
    console.error('Error deleting bus:', error);
    return false;
  }
};

export const updateBus = async (id: string, data: Partial<Bus>): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await updateDoc(doc(db as Firestore, 'buses', id), data as any);
    return true;
  } catch (error) {
    console.error('Error updating bus:', error);
    return false;
  }
};

// Routes collection functions
export const getAllRoutes = async (): Promise<Route[]> => {
  try {
    if (!checkClientAuth()) return [];

    const db = await getDatabase();

    // Fetch from routes collection
    const routesCol = collection(db as Firestore, 'routes');
    // Optional: Sort by routeId or createdAt
    const routeSnapshot = await getDocs(routesCol);

    return routeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
  } catch (error) {
    console.error('Error fetching routes:', error);
    return [];
  }
};

export const getRouteById = async (id: string): Promise<Route | null> => {
  try {
    const db = await getDatabase();

    // First, try fetching from routes collection
    const routeDoc = await getDoc(doc(db as Firestore, 'routes', id));
    if (routeDoc.exists()) {
      return { id: routeDoc.id, ...routeDoc.data() } as Route;
    }

    // If not found, return null (Routes should be in routes collection)
    return null;

    return null;
  } catch (error) {
    console.error('Error fetching route:', error);
    return null;
  }
};

export const deleteRoute = async (id: string): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await deleteDoc(doc(db as Firestore, 'routes', id));
    return true;
  } catch (error) {
    console.error('Error deleting route:', error);
    return false;
  }
};

export const updateRoute = async (id: string, data: Partial<Route>): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await updateDoc(doc(db as Firestore, 'routes', id), data as any);
    return true;
  } catch (error) {
    console.error('Error updating route:', error);
    return false;
  }
};

// Notifications collection functions
export const getAllNotifications = async (): Promise<Notification[]> => {
  try {
    const db = await getDatabase();
    const notificationsCol = collection(db as Firestore, 'notifications');
    const notificationSnapshot = await getDocs(notificationsCol);
    return notificationSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
};

export const getNotificationById = async (id: string): Promise<Notification | null> => {
  try {
    const db = await getDatabase();
    const notificationDoc = await getDoc(doc(db as Firestore, 'notifications', id));
    return notificationDoc.exists() ? { id: notificationDoc.id, ...notificationDoc.data() } as Notification : null;
  } catch (error) {
    console.error('Error fetching notification:', error);
    return null;
  }
};

export const deleteNotification = async (id: string): Promise<boolean> => {
  try {
    const db = await getDatabase();
    const notificationRef = doc(db as Firestore, 'notifications', id);

    // First, get the notification to check if user can delete it
    const notificationDoc = await getDoc(notificationRef);
    if (!notificationDoc.exists()) {
      console.error('Notification not found');
      return false;
    }

    const notificationData = notificationDoc.data();

    // Check if current user is authenticated
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('User not authenticated');
      return false;
    }

    // Check if user is the author or admin (this will be enforced by Firestore rules)
    // The Firestore rules will handle the actual permission check
    await deleteDoc(notificationRef);
    return true;
  } catch (error) {
    console.error('Error deleting notification:', error);
    return false;
  }
};

export const updateNotification = async (id: string, data: Partial<Notification>): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await updateDoc(doc(db as Firestore, 'notifications', id), data as any);
    return true;
  } catch (error) {
    console.error('Error updating notification:', error);
    return false;
  }
};

// Applications collection functions  
export const getAllApplications = async (): Promise<Application[]> => {
  try {
    const db = await getDatabase();
    const applicationsCol = collection(db as Firestore, 'applications');
    const applicationSnapshot = await getDocs(applicationsCol);
    return applicationSnapshot.docs.map(doc => ({ applicationId: doc.id, ...doc.data() } as Application));
  } catch (error) {
    console.error('Error fetching applications:', error);
    return [];
  }
};

export const getApplicationById = async (id: string): Promise<Application | null> => {
  try {
    const db = await getDatabase();
    const applicationDoc = await getDoc(doc(db as Firestore, 'applications', id));
    return applicationDoc.exists() ? { applicationId: applicationDoc.id, ...applicationDoc.data() } as Application : null;
  } catch (error) {
    console.error('Error fetching application:', error);
    return null;
  }
};

export const updateApplication = async (id: string, data: Partial<Application>): Promise<boolean> => {
  try {
    const db = await getDatabase();
    await updateDoc(doc(db as Firestore, 'applications', id), data as any);
    return true;
  } catch (error) {
    console.error('Error updating application:', error);
    return false;
  }
};

export const approveStudentApplication = async (applicationId: string, approvedBy: string): Promise<boolean> => {
  try {
    // Get current user for authentication
    const { auth } = await import('@/lib/firebase');
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user');
      return false;
    }

    const token = await currentUser.getIdToken();

    // Call the API endpoint which handles image deletion
    const response = await fetch('/api/applications/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        applicationId,
        approverName: currentUser.displayName || currentUser.email || 'Admin',
        approverId: approvedBy,
        notes: 'Application approved via admin panel'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error approving application:', errorData.error);
      return false;
    }

    const result = await response.json();
    console.log('Application approved successfully:', result);
    return true;
  } catch (error: any) {
    console.error('Error approving application:', error.message || error);
    return false;
  }
};

export const rejectStudentApplication = async (applicationId: string, rejectedBy: string, reason: string): Promise<boolean> => {
  try {
    // Get current user for authentication
    const { auth } = await import('@/lib/firebase');
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user');
      return false;
    }

    const token = await currentUser.getIdToken();

    // Call the API endpoint
    const response = await fetch('/api/applications/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        applicationId,
        rejectorName: currentUser.displayName || currentUser.email || 'Admin',
        rejectorId: rejectedBy,
        reason
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error rejecting application:', errorData.error);
      return false;
    }

    const result = await response.json();
    console.log('Application rejected successfully:', result);
    return true;
  } catch (error: any) {
    console.error('Error rejecting application:', error.message || error);
    return false;
  }
};

export const createApplication = async (applicationData: Omit<Application, 'applicationId'>): Promise<string | null> => {
  try {
    const db = await getDatabase();
    const applicationId = uuidv4();
    await setDoc(doc(db as Firestore, 'applications', applicationId), {
      ...applicationData,
      applicationId,
      createdAt: getCurrentTimestamp()
    });
    return applicationId;
  } catch (error) {
    console.error('Error creating application:', error);
    return null;
  }
};

export const getApplicationsByApplicantUID = async (applicantUID: string): Promise<Application[]> => {
  try {
    const db = await getDatabase();
    const applicationsCol = collection(db as Firestore, 'applications');
    const q = query(applicationsCol, where('applicantUID', '==', applicantUID));
    const applicationSnapshot = await getDocs(q);
    return applicationSnapshot.docs.map(doc => ({ applicationId: doc.id, ...doc.data() } as Application));
  } catch (error) {
    console.error('Error fetching applications by applicant UID:', error);
    return [];
  }
};

// Add missing functions
export const addRoute = async (routeData: Omit<Route, 'id'>): Promise<string | null> => {
  try {
    const db = await getDatabase();
    const routeId = routeData.routeId || uuidv4();
    await setDoc(doc(db as Firestore, 'routes', routeId), {
      ...routeData,
      routeId,
      createdAt: getCurrentTimestamp()
    });
    return routeId;
  } catch (error) {
    console.error('Error creating route:', error);
    return null;
  }
};

export const createNotification = async (notificationData: Omit<Notification, 'id'>): Promise<string | null> => {
  try {
    const db = await getDatabase();
    const notificationId = uuidv4();
    await setDoc(doc(db as Firestore, 'notifications', notificationId), {
      ...notificationData,
      createdAt: getCurrentTimestamp()
    });
    return notificationId;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

export const getStudentsByBusId = async (busId: string): Promise<Student[]> => {
  try {
    console.log('🔍 getStudentsByBusId called with busId:', busId);
    const db = await getDatabase();
    const studentsCol = collection(db as Firestore, 'students');

    // Try multiple field names for bus assignment
    const queries = [
      query(studentsCol, where('busId', '==', busId)),
      query(studentsCol, where('assignedBusId', '==', busId)),
      query(studentsCol, where('assignedBus', '==', busId)),
      query(studentsCol, where('currentBusId', '==', busId))
    ];

    let allStudents: any[] = [];

    for (const q of queries) {
      try {
        const studentSnapshot = await getDocs(q);
        const students = studentSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('📊 Student data from Firestore:', {
            id: doc.id,
            name: data.fullName || data.name,
            busId: data.busId || data.assignedBusId || data.assignedBus,
            profilePicture: data.profilePicture,
            profilePhotoUrl: data.profilePhotoUrl
          });

          return {
            id: doc.id,
            uid: doc.id,
            ...data,
            // Ensure profile picture fields are properly mapped
            profilePicture: data.profilePicture || data.profilePhotoUrl,
            profilePhotoUrl: data.profilePhotoUrl || data.profilePicture,
            // Map other fields properly
            fullName: data.fullName || data.name,
            email: data.email || data.emailAddress,
            phone: data.phone || data.phoneNumber,
            enrollmentId: data.enrollmentId || data.studentId
          } as Student;
        });

        allStudents = [...allStudents, ...students];
      } catch (error) {
        console.warn('Query failed for one of the bus ID fields:', error);
      }
    }

    // Remove duplicates based on document ID
    const uniqueStudents = allStudents.filter((student, index, self) =>
      index === self.findIndex(s => s.id === student.id)
    );

    console.log('✅ Found students for bus:', uniqueStudents.map(s => ({
      name: s.fullName || s.name,
      profilePicture: s.profilePicture,
      profilePhotoUrl: s.profilePhotoUrl
    })));

    return uniqueStudents;
  } catch (error) {
    console.error('Error fetching students by bus ID:', error);
    return [];
  }
};

export const markNotificationAsRead = async (notificationId: string, userId: string): Promise<boolean> => {
  try {
    const db = await getDatabase();
    // Use the notification_read_receipts collection instead of updating the notification directly
    const readReceiptRef = doc(db as Firestore, 'notification_read_receipts', `${notificationId}_${userId}`);
    await setDoc(readReceiptRef, {
      notificationId,
      userId,
      readAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
};

/**
 * Fetches all payments associated with a specific student UID from Supabase
 * @param uid The unique identifier (Firestore UID) of the student
 * @returns Array of payment documents
 */
export const getPaymentsByStudentUid = async (uid: string, enrollmentId?: string): Promise<any[]> => {
  try {
    // Get current user for authentication
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.warn('getPaymentsByStudentUid: No authenticated user found');
      return [];
    }

    const idToken = await currentUser.getIdToken();

    // Fetch from the API which queries Supabase
    // We pass both studentUid and studentId (Enrollment ID) if available
    // to ensure we catch all payments regardless of how they were indexed
    let url = `/api/payment/transactions?studentUid=${uid}`;
    if (enrollmentId) {
      url += `&studentId=${enrollmentId}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!response.ok) {
      console.error('getPaymentsByStudentUid: API error', response.status);
      return [];
    }

    const data = await response.json();
    return data.transactions || [];
  } catch (error) {
    console.error('Error fetching student payments from Supabase API:', error);
    return [];
  }
};

// Re-export Route type for convenience
export type { Route } from '@/lib/types';
