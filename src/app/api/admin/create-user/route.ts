import { headers } from 'next/headers';
import { User } from '@/lib/types';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { incrementBusCapacity } from '@/lib/busCapacityService';
import { generateOfflinePaymentId, OfflinePaymentDocument } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import {
  sendStudentAddedNotification,
  getAdminEmailRecipients,
  StudentAddedEmailData,
  AdminEmailRecipient
} from '@/lib/services/admin-email.service';
import { generateReceiptPdf } from '@/lib/services/receipt.service';
import path from 'path';
import fs from 'fs';
import { createUpdatedByEntry } from '@/lib/utils/updatedBy';

// Helper function to read bus fee from system_config.json
function getBusFeeFromConfig(): number {
  const configPath = path.join(process.cwd(), 'src', 'config', 'system_config.json');
  let busFeeAmount = 5000; // Default fallback

  if (fs.existsSync(configPath)) {
    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(fileContent);
      busFeeAmount = config?.busFee?.amount || 5000;
      console.log('📋 Bus fee loaded from system_config.json:', busFeeAmount);
    } catch (e) {
      console.error('Error reading system_config.json for bus fee:', e);
    }
  } else {
    // Fallback to bus_fee.json for backward compatibility
    const fallbackPath = path.join(process.cwd(), 'src', 'config', 'bus_fee.json');
    if (fs.existsSync(fallbackPath)) {
      try {
        const fileContent = fs.readFileSync(fallbackPath, 'utf-8');
        const busFeeData = JSON.parse(fileContent);
        busFeeAmount = busFeeData.amount || 5000;
        console.log('📋 Bus fee loaded from bus_fee.json (fallback):', busFeeAmount);
      } catch (e) {
        console.error('Error reading bus_fee.json:', e);
      }
    }
  }

  return busFeeAmount;
}

// Helper function to get route name from routeId
async function getRouteName(routeId: string): Promise<string> {
  if (!routeId) return 'Not Assigned';
  try {
    const routeDoc = await adminDb.collection('routes').doc(routeId).get();
    if (routeDoc.exists) {
      return routeDoc.data()?.routeName || routeDoc.data()?.name || routeId;
    }
  } catch (e) {
    console.error('Error fetching route name:', e);
  }
  return routeId;
}

// Helper function to get bus name from busId
async function getBusName(busId: string): Promise<string> {
  if (!busId) return 'Auto-assigned';
  try {
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (busDoc.exists) {
      const data = busDoc.data();
      const busNumber = data?.displayIndex || data?.sequenceNumber || data?.busNumber;
      const licensePlate = data?.licensePlate || data?.plateNumber;
      if (busNumber && licensePlate) {
        return `Bus-${busNumber} (${licensePlate})`;
      }
      return data?.name || busId;
    }
  } catch (e) {
    console.error('Error fetching bus name:', e);
  }
  return busId;
}

// Helper function to get stop name from route and stopId
async function getStopName(routeId: string, stopId: string): Promise<string> {
  if (!routeId || !stopId) return 'Not Selected';
  try {
    const routeDoc = await adminDb.collection('routes').doc(routeId).get();
    if (routeDoc.exists) {
      const stops = routeDoc.data()?.stops || [];
      const stop = stops.find((s: any) => s.id === stopId || s.stopId === stopId);
      if (stop) {
        return stop.name || stop.stopName || stopId;
      }
    }
  } catch (e) {
    console.error('Error fetching stop name:', e);
  }
  return stopId;
}

// Helper function to normalize shift values (remove "Shift" word, standardize to "Morning"/"Evening")
function normalizeShift(shift: string | undefined): string {
  if (!shift) return 'Morning';
  const normalized = shift.toLowerCase().trim();
  if (normalized.includes('evening')) return 'Evening';
  if (normalized.includes('morning')) return 'Morning';
  if (normalized === 'both') return 'Both';
  return 'Morning'; // Default
}


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
      semester, // Added semester
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
      assignedRouteId, // new field
      routeId, // legacy support 
      assignedBusId, // new field
      busId, // legacy support
      address,
      bloodGroup,
      shift,
      approvedBy,
      // Session fields for students
      durationYears, // New field for direct duration
      sessionDuration, // Fallback for duration
      sessionStartYear,
      sessionEndYear,
      validUntil,
      pickupPoint,
      stopId, // Standard field name
      status
    } = userData;

    // Use priority: stopId > pickupPoint
    const finalStopId = stopId || pickupPoint || '';
    // Use priority: durationYears > sessionDuration (parsed) > default 1
    const finalDuration = durationYears || parseInt(sessionDuration) || 1;

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
      // Calculate validity
      // Use provided validUntil or calculate it
      let finalValidUntil = validUntil;
      let finalSessionEndYear = sessionEndYear;

      if (!finalValidUntil) {
        const { newValidUntil } = calculateRenewalDate(null, finalDuration);
        finalValidUntil = newValidUntil;
        finalSessionEndYear = new Date(finalValidUntil).getFullYear();
      }

      // Compute block dates from finalValidUntil
      const blockDates = computeBlockDatesFromValidUntil(finalValidUntil);

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
        durationYears: finalDuration,
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
        shift: normalizeShift(shift),
        status: 'active', // Direct active status
        stopId: finalStopId, // Map to standardized stopId
        uid: uid,
        updatedAt: now,
        validUntil: finalValidUntil,
        // Block dates
        softBlock: blockDates.softBlock,
        hardBlock: blockDates.hardBlock,
        // Payment information
        paymentAmount: 0, // Will update below
        paid_on: now,
        // Audit trail - who created/updated this document
        updatedBy: [createUpdatedByEntry(currentUserName, currentUserEmployeeId)]
      };

      // Create Payment Record logic
      // 1. Read bus fee from system_config.json
      const busFeeAmount = getBusFeeFromConfig();

      const totalAmount = busFeeAmount * finalDuration;

      // Update student doc with payment amount
      studentDoc.paymentAmount = totalAmount;

      console.log('📝 Creating STUDENTS collection document for:', uid);
      await adminDb.collection('students').doc(uid).set(studentDoc);
      console.log('✅ STUDENTS document created successfully');

      // Generate payment ID (used for both supabase and email notification)
      const paymentId = generateOfflinePaymentId('new_registration');
      const offlineTransactionId = `manual_entry_${Date.now()}`;

      // Create Payment Document in SUPABASE
      if (totalAmount > 0) {
        const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');


        const paymentCreated = await paymentsSupabaseService.createPayment({
          paymentId,
          studentId: enrollmentId || '',
          studentUid: uid,
          studentName: name,
          stopId: finalStopId, // Map to standardized stopId
          amount: totalAmount,
          method: 'Offline',
          status: 'Completed',
          sessionStartYear: sessionStartYear || new Date().getFullYear(),
          sessionEndYear: finalSessionEndYear,
          durationYears: finalDuration,
          validUntil: new Date(finalValidUntil),
          transactionDate: new Date(),
          offlineTransactionId: offlineTransactionId,
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

      // Send email notification to admins if added by moderator
      if (currentUserRole === 'moderator') {
        console.log('📧 Moderator added student - sending notification to admins');
        try {
          // Resolve names for email notification
          const routeName = await getRouteName(routeId || '');
          const busName = await getBusName(busId || '');
          const stopName = await getStopName(routeId || '', finalStopId);

          // Fetch admin recipients from centralized service
          const adminRecipients = await getAdminEmailRecipients();

          if (adminRecipients.length > 0) {
            const emailData: StudentAddedEmailData = {
              studentName: name,
              studentEmail: email,
              studentPhone: phone || '',
              enrollmentId: enrollmentId || '',
              faculty: faculty || '',
              department: department || '',
              semester: semester || '',
              shift: shift || 'Morning',
              routeName,
              busName,
              pickupPoint: stopName,
              sessionStartYear: sessionStartYear || new Date().getFullYear(),
              sessionEndYear: finalSessionEndYear,
              validUntil: finalValidUntil,
              durationYears: durationYears,
              paymentAmount: totalAmount,
              transactionId: paymentId,
              addedBy: {
                name: currentUserName,
                employeeId: currentUserEmployeeId,
                role: 'moderator'
              },
              addedAt: now
            };

            // Generate e-receipt PDF
            // Add a small delay to ensure Supabase has fully committed the payment record
            console.log('📄 Waiting for Supabase consistency before generating PDF...');
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log('📄 Generating e-receipt PDF for email attachment with paymentId:', paymentId);
            let pdfBuffer: Buffer | null = null;
            try {
              pdfBuffer = await generateReceiptPdf(paymentId);
              if (pdfBuffer) {
                console.log('✅ PDF generated successfully, size:', pdfBuffer.length, 'bytes');
              } else {
                console.warn('⚠️ PDF generation returned null - payment might not be found in Supabase');
              }
            } catch (pdfError) {
              console.error('❌ Error generating PDF:', pdfError);
            }

            const emailResult = await sendStudentAddedNotification(
              adminRecipients,
              emailData,
              pdfBuffer ? {
                content: pdfBuffer,
                filename: `Receipt_${name.replace(/\s+/g, '_')}_${paymentId}.pdf`
              } : undefined
            );

            if (emailResult.success) {
              console.log('✅ Admin notification email sent successfully' + (pdfBuffer ? ' with e-receipt' : ''));
            } else {
              console.warn('⚠️ Failed to send admin notification email:', emailResult.error);
            }
          } else {
            console.warn('⚠️ No admin recipients found for notification');
          }
        } catch (emailError) {
          console.error('❌ Error sending notification email:', emailError);
          // Don't fail the request just because email failed
        }
      }

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
        profilePhotoUrl: profilePhotoUrl || '',
        assignedRouteId: assignedRouteId || routeId || null,
        assignedBusId: assignedBusId || busId || null,
        shift: shift || 'Morning & Evening', // Default to Both Shifts if not provided
        approvedBy: approvedByDisplay,
        dob: dob || '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        // Audit trail - who created/updated this document
        updatedBy: [createUpdatedByEntry(currentUserName, currentUserEmployeeId)]
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
        updatedAt: now,
        // Audit trail - who created/updated this document
        updatedBy: [createUpdatedByEntry(currentUserName, currentUserEmployeeId)]
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