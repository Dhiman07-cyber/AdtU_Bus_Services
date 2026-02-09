import { adminDb } from './firebase-admin';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

interface ExpiryCheckResult {
  totalChecked: number;
  remindersSent: number;
  errors: string[];
  skipped?: boolean;
}

/**
 * Main function to check for expiring students and send reminders
 * Dynamically scheduled based on deadline-config from Firestore
 */
export async function checkAndNotifyExpiringStudents(force: boolean = false): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    totalChecked: 0,
    remindersSent: 0,
    errors: []
  };

  try {
    const deadlineConfig = await getDeadlineConfig();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentDay = now.getDate();

    // Configuration from Firestore
    const notifMonth = deadlineConfig.renewalNotification.month; // e.g., 5 (June)
    const notifDay = deadlineConfig.renewalNotification.day; // e.g., 1

    // Check Schedule: Only run on the configured notification start day
    if (!force && (currentMonth !== notifMonth || currentDay !== notifDay)) {
      console.log(`⏭️ Main Expiry check skipped. Configured for: ${deadlineConfig.renewalNotification.monthName} ${notifDay}, Today: ${now.toDateString()}`);
      result.skipped = true;
      return result;
    }

    // Determine Expiry Window (Target Deadline)
    // We are looking for students expiring around the configured renewal deadline of THIS year
    const deadlineMonth = deadlineConfig.renewalDeadline.month; // e.g., 6 (July)
    const deadlineDay = deadlineConfig.renewalDeadline.day; // e.g., 1

    const deadlineFirst = new Date(currentYear, deadlineMonth, deadlineDay);
    const deadlineNext = new Date(currentYear, deadlineMonth, deadlineDay + 1);

    console.log(`🔍 Checking for students expiring on: ${deadlineFirst.toDateString()}`);

    // Query students whose validUntil is EXACTLY on the deadline date
    // Note: Depends on how validUntil is stored (ISO string usually). 
    // We check strictly for the deadline date as defined in config.
    const studentsQuery = await adminDb.collection('students')
      .where('status', '==', 'active')
      .where('validUntil', '>=', deadlineFirst.toISOString())
      .where('validUntil', '<', deadlineNext.toISOString())
      .get();

    result.totalChecked = studentsQuery.size;
    console.log(`📊 Found ${result.totalChecked} students expiring on ${deadlineFirst.toDateString()}`);

    // Process each expiring student
    for (const studentDoc of studentsQuery.docs) {
      try {
        const studentData = studentDoc.data();
        const studentUid = studentDoc.id;

        // Check if reminder already sent THIS YEAR (in the notification month)
        const checkStart = new Date(currentYear, notifMonth, 1);
        const checkEnd = new Date(currentYear, notifMonth + 1, 1);

        const existingReminderQuery = await adminDb.collection('notifications')
          .where('toUid', '==', studentUid)
          .where('type', '==', 'ExpiryReminder')
          .where('createdAt', '>=', checkStart.toISOString())
          .where('createdAt', '<', checkEnd.toISOString())
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

        // Update student document
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

    if (result.remindersSent > 0) {
      await sendAdminSummary(result, "Expiry Reminders Sent", deadlineFirst);
    }

    return result;
  } catch (error: any) {
    console.error('❌ Fatal error in expiry check:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

/**
 * Send a second reminder mid-month (e.g., 15th)
 */
export async function sendMidJuneReminder(force: boolean = false): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    totalChecked: 0,
    remindersSent: 0,
    errors: []
  };

  try {
    const deadlineConfig = await getDeadlineConfig();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();

    const notifMonth = deadlineConfig.renewalNotification.month;
    const midMonthDay = 15; // Standard mid-month logic

    // Check Schedule: Only run on 15th of the configured notification month
    if (!force && (currentMonth !== notifMonth || currentDay !== midMonthDay)) {
      console.log(`⏭️ Mid-month reminder skipped. Configured for: ${deadlineConfig.renewalNotification.monthName} ${midMonthDay}, Today: ${now.toDateString()}`);
      result.skipped = true;
      return result;
    }

    const deadlineMonth = deadlineConfig.renewalDeadline.month;
    const deadlineDay = deadlineConfig.renewalDeadline.day;
    const deadlineFirst = new Date(currentYear, deadlineMonth, deadlineDay);
    const deadlineNext = new Date(currentYear, deadlineMonth, deadlineDay + 1);

    // Get students still expiring (haven't renewed)
    const studentsQuery = await adminDb.collection('students')
      .where('status', '==', 'active')
      .where('validUntil', '>=', deadlineFirst.toISOString())
      .where('validUntil', '<', deadlineNext.toISOString())
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
        result.errors.push(`Failed to send mid-month reminder to ${studentDoc.id}: ${error.message}`);
      }
    }

    if (result.remindersSent > 0) {
      console.log(`📈 Mid-Month Reminder Summary: ${result.remindersSent} reminders sent`);
    }

    return result;
  } catch (error: any) {
    console.error('❌ Error in mid-month reminder:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

async function sendAdminSummary(result: ExpiryCheckResult, title: string, expiryDate: Date) {
  const currentYear = new Date().getFullYear();
  const adminsQuery = await adminDb.collection('admins').get();

  const batch = adminDb.batch();

  for (const adminDoc of adminsQuery.docs) {
    const notifRef = adminDb.collection('notifications').doc();
    batch.set(notifRef, {
      notifId: notifRef.id,
      toUid: adminDoc.id,
      toRole: 'admin',
      type: 'ExpiryReminderSummary',
      title: title,
      body: `${result.remindersSent} students were notified about their expiring bus service (${expiryDate.toLocaleDateString()}). Please ensure the Bus Office is prepared for renewals.`,
      read: false,
      createdAt: new Date().toISOString(),
      summary: {
        totalChecked: result.totalChecked,
        remindersSent: result.remindersSent,
        errors: result.errors.length
      }
    });
  }

  await batch.commit();
}

/**
 * Function to manually trigger expiry check
 */
export async function manualExpiryCheck(targetMonth?: number, targetYear?: number): Promise<ExpiryCheckResult> {
  console.log('🔧 Manual expiry check triggered');
  // For manual run, we force execution regardless of date
  return checkAndNotifyExpiringStudents(true);
}
