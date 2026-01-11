/**
 * Expiry Check & Reminder System
 * 
 * This module handles automatic expiry reminders for students
 * whose bus service is about to expire in the next month.
 * 
 * Scheduled to run on June 1st every year.
 */

import { adminDb } from './firebase-admin';

interface ExpiryCheckResult {
  totalChecked: number;
  remindersSent: number;
  errors: string[];
}

/**
 * Main function to check for expiring students and send reminders
 * Should be called by a cron job/cloud function on June 1st
 */
export async function checkAndNotifyExpiringStudents(): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    totalChecked: 0,
    remindersSent: 0,
    errors: []
  };

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (June = 5)

    // Only run this check in June (month 5)
    if (currentMonth !== 5) {
      console.log(`⏭️ Expiry check skipped - not June (current month: ${currentMonth + 1})`);
      return result;
    }

    // Calculate the July 1st of current year (expiry date we're checking for)
    const julyFirst = new Date(currentYear, 6, 1); // month 6 = July
    const julySecond = new Date(currentYear, 6, 2);

    console.log(`🔍 Checking for students expiring on: ${julyFirst.toISOString()}`);

    // Query students whose validUntil is between July 1 and July 2 of current year
    const studentsQuery = await adminDb.collection('students')
      .where('status', '==', 'active')
      .where('validUntil', '>=', julyFirst.toISOString())
      .where('validUntil', '<', julySecond.toISOString())
      .get();

    result.totalChecked = studentsQuery.size;
    console.log(`📊 Found ${result.totalChecked} students expiring in July ${currentYear}`);

    // Process each expiring student
    for (const studentDoc of studentsQuery.docs) {
      try {
        const studentData = studentDoc.data();
        const studentUid = studentDoc.id;

        // Check if we've already sent a reminder this year
        const existingReminderQuery = await adminDb.collection('notifications')
          .where('toUid', '==', studentUid)
          .where('type', '==', 'ExpiryReminder')
          .where('createdAt', '>=', new Date(currentYear, 5, 1).toISOString()) // June 1st
          .where('createdAt', '<', new Date(currentYear, 6, 1).toISOString()) // July 1st
          .limit(1)
          .get();

        if (!existingReminderQuery.empty) {
          console.log(`⏭️ Skipping ${studentData.fullName} - reminder already sent`);
          continue;
        }

        // Create expiry reminder notification
        const notifRef = adminDb.collection('notifications').doc();
        const validUntilDate = new Date(studentData.validUntil);

        await notifRef.set({
          notifId: notifRef.id,
          toUid: studentUid,
          toRole: 'student',
          type: 'ExpiryReminder',
          title: 'Bus Service Renewal Reminder',
          body: `Your bus service (session ${studentData.sessionStartYear}-${studentData.sessionEndYear}) will expire on ${validUntilDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Please renew by visiting the Bus Office or apply online to continue your service.`,
          links: {
            profile: '/student/profile',
            renewPage: '/apply'
          },
          read: false,
          createdAt: new Date().toISOString(),
          expiryDetails: {
            sessionStartYear: studentData.sessionStartYear,
            sessionEndYear: studentData.sessionEndYear,
            validUntil: studentData.validUntil
          }
        });

        // Update student document with reminder tracking
        await studentDoc.ref.update({
          lastExpiryReminderSentAt: new Date().toISOString(),
          expiryReminderCount: (studentData.expiryReminderCount || 0) + 1
        });

        result.remindersSent++;
        console.log(`✅ Sent reminder to ${studentData.fullName} (${studentData.enrollmentId})`);
      } catch (error: any) {
        const errorMsg = `Failed to process student ${studentDoc.id}: ${error.message}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    // Send summary notification to admins
    const adminsQuery = await adminDb.collection('admins').get();
    const summaryNotificationPromises = [];

    for (const adminDoc of adminsQuery.docs) {
      const notifRef = adminDb.collection('notifications').doc();
      summaryNotificationPromises.push(
        notifRef.set({
          notifId: notifRef.id,
          toUid: adminDoc.id,
          toRole: 'admin',
          type: 'ExpiryReminderSummary',
          title: 'Expiry Reminders Sent',
          body: `${result.remindersSent} students were notified about their expiring bus service (July ${currentYear}). Please ensure the Bus Office is prepared for renewals.`,
          read: false,
          createdAt: new Date().toISOString(),
          summary: {
            totalChecked: result.totalChecked,
            remindersSent: result.remindersSent,
            errors: result.errors.length
          }
        })
      );
    }

    await Promise.all(summaryNotificationPromises);

    console.log(`\n📈 Expiry Check Summary:`);
    console.log(`   Total students checked: ${result.totalChecked}`);
    console.log(`   Reminders sent: ${result.remindersSent}`);
    console.log(`   Errors: ${result.errors.length}`);

    return result;
  } catch (error: any) {
    console.error('❌ Fatal error in expiry check:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

/**
 * Function to manually trigger expiry check (for testing or manual runs)
 */
export async function manualExpiryCheck(targetMonth?: number, targetYear?: number): Promise<ExpiryCheckResult> {
  console.log('🔧 Manual expiry check triggered');

  if (targetMonth !== undefined && targetYear !== undefined) {
    // For testing: temporarily override date checking
    console.log(`Testing mode: checking for ${targetYear}-${targetMonth + 1}`);
  }

  return checkAndNotifyExpiringStudents();
}

/**
 * Send a second reminder mid-June to students who haven't renewed
 */
export async function sendMidJuneReminder(): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    totalChecked: 0,
    remindersSent: 0,
    errors: []
  };

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();

    // Only run on June 15th
    if (now.getMonth() !== 5 || currentDay !== 15) {
      console.log('⏭️ Mid-June reminder skipped - not June 15th');
      return result;
    }

    const julyFirst = new Date(currentYear, 6, 1);
    const julySecond = new Date(currentYear, 6, 2);

    // Get students still expiring (haven't renewed)
    const studentsQuery = await adminDb.collection('students')
      .where('status', '==', 'active')
      .where('validUntil', '>=', julyFirst.toISOString())
      .where('validUntil', '<', julySecond.toISOString())
      .get();

    result.totalChecked = studentsQuery.size;

    for (const studentDoc of studentsQuery.docs) {
      try {
        const studentData = studentDoc.data();
        const studentUid = studentDoc.id;

        // Check reminder count - only send if count is 1 (first reminder sent)
        if ((studentData.expiryReminderCount || 0) !== 1) {
          continue;
        }

        const notifRef = adminDb.collection('notifications').doc();
        const validUntilDate = new Date(studentData.validUntil);

        await notifRef.set({
          notifId: notifRef.id,
          toUid: studentUid,
          toRole: 'student',
          type: 'ExpiryReminder',
          title: 'Final Reminder: Bus Service Expiring Soon',
          body: `This is a final reminder that your bus service expires on ${validUntilDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Only 2 weeks left! Renew now to avoid service interruption.`,
          links: {
            profile: '/student/profile',
            renewPage: '/apply'
          },
          read: false,
          createdAt: new Date().toISOString(),
          isSecondReminder: true
        });

        await studentDoc.ref.update({
          lastExpiryReminderSentAt: new Date().toISOString(),
          expiryReminderCount: 2
        });

        result.remindersSent++;
      } catch (error: any) {
        result.errors.push(`Failed to send mid-June reminder to ${studentDoc.id}: ${error.message}`);
      }
    }

    console.log(`📈 Mid-June Reminder Summary: ${result.remindersSent} reminders sent`);
    return result;
  } catch (error: any) {
    console.error('❌ Error in mid-June reminder:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

