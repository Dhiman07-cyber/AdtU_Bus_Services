/**
 * Bus Pass Service
 * Simplified service for student QR verification
 * 
 * Design: Student's Firestore UID is used directly as the QR code value.
 * No token generation, no temporary data, no cleanup needed.
 * 
 * The student UID is the single source of truth for scan identity.
 */

import { adminDb } from './firebase-admin';
import { BusPassVerificationResult } from './types';

/**
 * Helper function to safely convert validUntil to Date
 */
function getValidUntilDate(validUntil: any): Date | null {
  if (!validUntil) return null;

  try {
    // If it's a Firestore Timestamp
    if (validUntil.toDate && typeof validUntil.toDate === 'function') {
      return validUntil.toDate();
    }
    // If it's already a Date object
    if (validUntil instanceof Date) {
      return validUntil;
    }
    // If it's a string or number, try to create Date
    return new Date(validUntil);
  } catch (error) {
    console.warn('Error converting validUntil to Date:', error);
    return null;
  }
}

/**
 * Verify a student by their Firestore UID
 * This is the core verification function - uses UID directly, no tokens.
 */
export async function verifyStudentByUid(
  studentUid: string,
  driverUid: string,
  scannerBusId?: string
): Promise<BusPassVerificationResult> {
  try {
    // Verify driver exists
    const driverDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!driverDoc.exists || driverDoc.data()?.role !== 'driver') {
      // Also check drivers collection
      const driverDoc2 = await adminDb.collection('drivers').doc(driverUid).get();
      if (!driverDoc2.exists) {
        return { status: 'invalid', message: 'Invalid driver credentials' };
      }
    }

    // Fetch student data - try students collection first
    let studentData: any = null;
    let studentDoc = await adminDb.collection('students').doc(studentUid).get();

    if (studentDoc.exists) {
      studentData = studentDoc.data();
    } else {
      // Try users collection as fallback
      studentDoc = await adminDb.collection('users').doc(studentUid).get();
      if (studentDoc.exists && studentDoc.data()?.role === 'student') {
        studentData = studentDoc.data();
      }
    }

    if (!studentData) {
      return {
        status: 'invalid',
        message: 'Student not found',
        studentData: undefined,
        isAssigned: false,
        sessionActive: false
      };
    }

    // Check session validity
    const validUntil = studentData.validUntil;
    const validUntilDate = getValidUntilDate(validUntil);
    const now = new Date();

    let sessionActive = true;
    if (validUntilDate && validUntilDate < now) {
      sessionActive = false;
    }

    // Check student status
    const isStudentActive = studentData.status === 'active';

    // Get bus assignment
    const assignedBusId = studentData.assignedBus || studentData.busId || studentData.currentBusId;

    // Determine final status
    const isVerified = sessionActive && isStudentActive;

    return {
      status: isVerified ? 'success' : 'session_expired',
      message: isVerified ? 'Student verified' : 'Student session expired or inactive',
      studentData: {
        uid: studentUid,
        fullName: studentData.fullName || studentData.name,
        enrollmentId: studentData.enrollmentId || studentData.enrollmentNo,
        phone: studentData.phone || studentData.mobileNumber || studentData.contactNumber,
        phoneNumber: studentData.phoneNumber || studentData.phone || studentData.mobileNumber,
        mobileNumber: studentData.mobileNumber || studentData.phone,
        gender: studentData.gender,
        profilePhotoUrl: studentData.profilePhotoUrl || studentData.photoURL || studentData.avatar,
        assignedBus: assignedBusId,
        busId: assignedBusId,
        assignedShift: studentData.assignedShift || studentData.shift,
        shift: studentData.assignedShift || studentData.shift,
        validUntil: validUntilDate ? validUntilDate.toISOString() : undefined,
        status: studentData.status,
        parentPhone: '',
        assignedRoute: ''
      },
      isAssigned: !!assignedBusId,
      sessionActive: isVerified
    };

  } catch (error: any) {
    console.error('Error verifying student:', error);
    return {
      status: 'invalid',
      message: error.message || 'Failed to verify student'
    };
  }
}

/**
 * Get student data by UID
 * Simple fetch function for student information
 */
export async function getStudentData(studentUid: string): Promise<any | null> {
  try {
    // Try students collection first
    let studentDoc = await adminDb.collection('students').doc(studentUid).get();

    if (studentDoc.exists) {
      return { id: studentDoc.id, ...studentDoc.data() };
    }

    // Try users collection as fallback
    studentDoc = await adminDb.collection('users').doc(studentUid).get();
    if (studentDoc.exists && studentDoc.data()?.role === 'student') {
      return { id: studentDoc.id, ...studentDoc.data() };
    }

    return null;
  } catch (error) {
    console.error('Error fetching student data:', error);
    return null;
  }
}
