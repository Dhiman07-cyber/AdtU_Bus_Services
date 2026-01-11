import { headers } from 'next/headers';
import { User } from '@/lib/types';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { incrementBusCapacity } from '@/lib/busCapacityService';
import { generateOfflinePaymentId, OfflinePaymentDocument } from '@/lib/types/payment';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    // Check authentication
    const authHeader = (await headers()).get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    let currentUserUid: string;
    let currentUserRole: string = '';
    let currentUserEmployeeId: string = 'ADMIN';
    let currentUserName: string = 'System';

    // Verify the token with Firebase Admin SDK
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      currentUserUid = decodedToken.uid;

      // 1. Check if user is admin
      const adminDoc = await adminDb.collection('admins').doc(currentUserUid).get();
      if (adminDoc.exists) {
        currentUserRole = 'admin';
        currentUserName = adminDoc.data()?.name || 'Admin';
        currentUserEmployeeId = adminDoc.data()?.employeeId || 'ADMIN';
      } else {
        // 2. Check if user is moderator
        const modDoc = await adminDb.collection('moderators').doc(currentUserUid).get();
        if (modDoc.exists) {
          currentUserRole = 'moderator';
          currentUserName = modDoc.data()?.fullName || modDoc.data()?.name || 'Moderator';
          currentUserEmployeeId = modDoc.data()?.employeeId || modDoc.data()?.staffId || 'MOD';
        } else {
          // 3. Fallback check for 'users' collection with role='admin' (legacy/dev)
          const userDoc = await adminDb.collection('users').doc(currentUserUid).get();
          if (userDoc.exists && userDoc.data()?.role === 'admin') {
            currentUserRole = 'admin';
            currentUserName = userDoc.data()?.name || 'Admin';
          }
        }
      }

      if (currentUserRole !== 'admin' && currentUserRole !== 'moderator') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Forbidden: User is not an admin or moderator'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
      permissions,
      aadharNumber,
      driverId,
      employeeId,
      staffId,
      routeId,
      busId,
      address,
      bloodGroup,
      shift,
      approvedBy,
      // Session fields for students
      sessionDuration,
      sessionStartYear,
      sessionEndYear,
      validUntil,
      pickupPoint,
      status,
      semester // Added semester
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

    // Check if user already exists
    let uid: string;
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      uid = userRecord.uid;
      console.log('Found existing Firebase user with UID:', uid);
    } catch (error: any) {
      // Create new user in Firebase Auth
      console.log('User does not exist in Firebase Auth, creating them now');
      const userRecord = await adminAuth.createUser({
        email: email,
        emailVerified: true
      });
      uid = userRecord.uid;
      console.log('Created Firebase user with UID:', uid);
    }

    const now = new Date().toISOString();
    const approvedByDisplay = currentUserRole === 'admin' ? `${currentUserName} (Admin)` : `${currentUserName} ( ${currentUserEmployeeId} )`;

    // 1. Handle STUDENT creation (Exact match to Approval Flow)
    if (role === 'student') {
      const durationYears = parseInt(sessionDuration || '1');

      // Calculate validity
      // Use provided validUntil or calculate it
      let finalValidUntil = validUntil;
      let finalSessionEndYear = sessionEndYear;

      if (!finalValidUntil) {
        const { newValidUntil } = calculateRenewalDate(null, durationYears);
        finalValidUntil = newValidUntil;
        finalSessionEndYear = new Date(finalValidUntil).getFullYear();
      }

      // Create STUDENTS collection document
      const studentDoc: any = {
        address: address || '',
        age: age ? parseInt(age) : 0,
        alternatePhone: alternatePhone || '',
        approvedAt: now,
        approvedBy: approvedByDisplay,
        bloodGroup: bloodGroup || '',
        busId: busId || (routeId ? routeId.replace('route_', 'bus_') : ''),
        createdAt: now,
        department: department || '',
        dob: dob || '',
        durationYears: durationYears,
        email: email,
        enrollmentId: enrollmentId || '',
        faculty: faculty || '',
        fullName: name,
        gender: gender || '',
        parentName: parentName || '',
        parentPhone: parentPhone || '',
        phoneNumber: phone || '', // Note: 'phoneNumber' in student doc vs 'phone' in form
        profilePhotoUrl: profilePhotoUrl || '',
        role: 'student',
        routeId: routeId || '',
        semester: semester || '',
        sessionEndYear: finalSessionEndYear,
        sessionStartYear: sessionStartYear || new Date().getFullYear(),
        shift: shift || 'Morning',
        status: 'active', // Direct active status
        stopId: pickupPoint || '', // Map pickupPoint to stopId
        uid: uid,
        updatedAt: now,
        validUntil: finalValidUntil,
        // Payment information
        paymentAmount: 0, // Will update below
        paid_on: now
      };

      // Create Payment Record logic
      // 1. Read bus fee config
      const configPath = path.join(process.cwd(), 'src', 'config', 'bus_fee.json');
      let busFeeAmount = 1200; // Default fallback
      if (fs.existsSync(configPath)) {
        try {
          const fileContent = fs.readFileSync(configPath, 'utf-8');
          const busFeeData = JSON.parse(fileContent);
          busFeeAmount = busFeeData.amount || 1200;
        } catch (e) { console.error("Error reading bus fee config", e); }
      }

      const totalAmount = busFeeAmount * durationYears;

      // Update student doc with payment amount
      studentDoc.paymentAmount = totalAmount;

      console.log('📝 Creating STUDENTS collection document for:', uid);
      await adminDb.collection('students').doc(uid).set(studentDoc);
      console.log('✅ STUDENTS document created successfully');

      // Create Payment Document in SUPABASE
      if (totalAmount > 0) {
        const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
        const paymentId = generateOfflinePaymentId('new_registration');

        const paymentCreated = await paymentsSupabaseService.createPayment({
          paymentId,
          studentId: enrollmentId || '',
          studentUid: uid,
          studentName: name,
          amount: totalAmount,
          method: 'Offline',
          status: 'Completed',
          sessionStartYear: sessionStartYear || new Date().getFullYear(),
          sessionEndYear: finalSessionEndYear,
          durationYears: durationYears,
          validUntil: new Date(finalValidUntil),
          transactionDate: new Date(),
          offlineTransactionId: `manual_entry_${Date.now()}`,
          approvedBy: {
            type: 'Manual',
            userId: currentUserUid,
            empId: currentUserEmployeeId,
            name: currentUserName,
            role: currentUserRole === 'admin' ? 'Admin' : 'Moderator'
          },
          approvedAt: new Date(),
        });

        if (paymentCreated) {
          console.log('✅ PAYMENT created in Supabase for manual student addition:', paymentId);
        } else {
          console.warn('⚠️ Failed to create payment in Supabase');
        }
      }

      // Increment Bus Capacity
      if (studentDoc.busId) {
        console.log(`🚌 Incrementing capacity for bus ${studentDoc.busId}`);
        try {
          await incrementBusCapacity(studentDoc.busId, uid, shift);
          console.log(`✅ Bus capacity incremented for ${studentDoc.busId}`);
        } catch (err) {
          console.error(`⚠️ Failed to increment capacity for ${studentDoc.busId}`, err);
        }
      }

      // Create Minimal USER document
      const userDoc = {
        createdAt: now,
        email: email,
        name: name,
        role: 'student',
        uid: uid
      };
      await adminDb.collection('users').doc(uid).set(userDoc);
      console.log('✅ USERS document created successfully');

    } else if (role === 'driver') {
      const driverDocData: any = {
        uid, // Set the actual Firebase Auth UID
        email,
        fullName: name,
        licenseNumber: licenseNumber || '',
        aadharNumber: aadharNumber || '',
        phone: phone || '',
        altPhone: alternatePhone || '',
        joiningDate: joiningDate || '',
        driverId: driverId || employeeId || '',
        address: address || '',
        profilePhotoUrl: profilePhotoUrl || '',
        assignedRouteId: routeId || null,
        routeId: routeId || null, // Same as assignedRouteId for consistency
        assignedBusId: busId || null,
        busId: busId || null, // Same as assignedBusId for consistency
        shift: shift || 'Morning & Evening', // Default to Both Shifts if not provided
        approvedBy: approvedByDisplay,
        dob: dob || '',
        status: 'active',
        createdAt: now,
        updatedAt: now
      };

      await adminDb.collection('drivers').doc(uid).set(driverDocData);

      // Update bus document with driver assignments
      if (busId) {
        console.log(`🚌 Updating bus ${busId} with driver ${uid}`);
        const busRef = adminDb.collection('buses').doc(busId);
        const busDoc = await busRef.get();

        if (busDoc.exists) {
          await busRef.update({
            activeDriverId: uid,
            assignedDriverId: uid,
            activeTripId: null, // Clear any stale trip data
            updatedAt: now
          });
          console.log(`   ✅ Bus ${busId} updated successfully`);
        } else {
          console.warn(`   ⚠️  Bus ${busId} does not exist - skipping bus update`);
        }
      }

      // Create Minimal USER document
      const userDoc = {
        createdAt: now,
        email: email,
        name: name,
        role: 'driver',
        uid: uid
      };
      await adminDb.collection('users').doc(uid).set(userDoc);

    } else if (role === 'moderator') {
      const moderatorDocData: any = {
        uid, // Set the actual Firebase Auth UID
        email,
        fullName: name,
        dob: dob || '',
        joiningDate: joiningDate || '',
        aadharNumber: aadharNumber || '',
        phone: phone || '',
        altPhone: alternatePhone || '',
        staffId: employeeId || staffId || '', // Use employeeId from form, fallback to staffId
        employeeId: employeeId || staffId || '', // Also store as employeeId for consistency
        profilePhotoUrl: profilePhotoUrl || '',
        approvedBy: approvedByDisplay,
        address: address || '',
        status: status || 'active',
        createdAt: now,
        updatedAt: now
      };

      await adminDb.collection('moderators').doc(uid).set(moderatorDocData);

      // Create Minimal USER document
      const userDoc = {
        createdAt: now,
        email: email,
        name: name,
        role: 'moderator',
        uid: uid
      };
      await adminDb.collection('users').doc(uid).set(userDoc);
    } else if (role === 'admin') {
      // Create user document in users collection (Full Admin Doc)
      const userDocData: any = {
        uid, // Set the actual Firebase Auth UID
        email,
        name,
        role,
        createdAt: now,
        busFee: 0,
        busFeeUpdatedAt: now,
        busFeeVersion: 1
      };
      await adminDb.collection('users').doc(uid).set(userDocData);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully. They can sign in with Google using the email provided.`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

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