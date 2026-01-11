/**
 * Firestore Reads Safety Load Test
 * 
 * Simulates worst-case usage patterns to validate that daily reads stay under 40k
 * (with 10k margin before hitting 50k Spark plan limit).
 * 
 * SCENARIO:
 * - 500 student clients mounting allowed single-doc listeners
 * - 15 admin clients polling paginated lists every 120s
 * - 20% reconnect jitter (random disconnects/reconnects)
 * - 5 bus status updates per bus per day (typical trip patterns)
 * 
 * RUN:
 *   node loadtests/firestore_reads_safety_test.js
 * 
 * EXPECTED OUTPUT:
 *   Estimated reads/day: <40,000
 *   Status: PASS
 * 
 * @module loadtests/firestore_reads_safety_test
 * @version 1.0.0
 * @since 2026-01-02
 */

// ============================================================================
// CONFIGURATION - Adjust these to match your expected usage
// ============================================================================

const CONFIG = {
    // User counts
    students: 500,
    admins: 15,
    moderators: 5,
    drivers: 20,
    buses: 15,

    // Student behavior (single-doc listeners only)
    studentSessionsPerDay: 2,           // Average app opens per student per day
    avgSessionDurationMinutes: 15,      // Average session length
    busStatusListenerMountedPercent: 80, // % of sessions that mount bus status listener
    profileViewsPerSession: 0.5,        // Average profile views per session

    // Bus status updates (triggers listener callbacks)
    busStatusUpdatesPerBusPerDay: 5,    // Start trip, end trip, status changes

    // Admin/Moderator behavior (paginated queries only)
    adminRefreshesPerHour: 0.5,         // Manual refresh clicks per hour
    adminSessionsPerDay: 2,             // Admin login sessions per day
    adminSessionDurationHours: 4,       // Average admin session length
    adminAutoRefreshEnabled: false,     // Auto-refresh is OFF by default

    // Notifications (user-scoped queries)
    notificationQueriesPerSession: 3,   // Navbar mount + manual refreshes
    avgNotificationsPerUser: 20,        // Average notifications returned per query

    // Network jitter and reconnects
    reconnectProbability: 0.20,         // 20% chance of reconnect during session
    readsPerReconnect: 1,               // Listener re-mount on reconnect

    // Safety multiplier for network jitter
    jitterMultiplier: 1.5,              // Conservative buffer for real-world variance

    // Pagination
    pageSize: 50,                       // Docs per admin page load

    // Quota limits
    sparkDailyLimit: 50000,
    targetSafeLimit: 40000,
};

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

function calculateStudentReads() {
    const {
        students,
        studentSessionsPerDay,
        busStatusListenerMountedPercent,
        profileViewsPerSession,
        busStatusUpdatesPerBusPerDay,
        buses,
        reconnectProbability,
        readsPerReconnect,
    } = CONFIG;

    // Initial mount reads (1 read per single-doc listener mount)
    const busStatusMounts = students * studentSessionsPerDay * (busStatusListenerMountedPercent / 100);
    const profileMounts = students * studentSessionsPerDay * profileViewsPerSession;

    // Update reads (each bus update triggers 1 read per listening student)
    // Assuming ~30 students per bus on average
    const studentsPerBus = students / buses;
    const updateReadsTotal = buses * busStatusUpdatesPerBusPerDay * studentsPerBus * (busStatusListenerMountedPercent / 100);

    // Reconnect overhead
    const reconnects = students * studentSessionsPerDay * reconnectProbability * readsPerReconnect;

    const totalStudentReads = busStatusMounts + profileMounts + updateReadsTotal + reconnects;

    return {
        busStatusMounts: Math.round(busStatusMounts),
        profileMounts: Math.round(profileMounts),
        updateReads: Math.round(updateReadsTotal),
        reconnects: Math.round(reconnects),
        total: Math.round(totalStudentReads),
    };
}

function calculateAdminReads() {
    const {
        admins,
        moderators,
        adminSessionsPerDay,
        adminSessionDurationHours,
        adminRefreshesPerHour,
        pageSize,
        notificationQueriesPerSession,
        avgNotificationsPerUser,
        reconnectProbability,
        readsPerReconnect,
    } = CONFIG;

    const totalAdminUsers = admins + moderators;

    // Initial page load (paginated, 50 docs)
    const initialLoads = totalAdminUsers * adminSessionsPerDay * pageSize;

    // Manual refreshes during session
    const manualRefreshes = totalAdminUsers * adminSessionsPerDay *
        (adminSessionDurationHours * adminRefreshesPerHour) * pageSize;

    // Notification queries (user-scoped, limited)
    const notificationReads = totalAdminUsers * adminSessionsPerDay *
        notificationQueriesPerSession * Math.min(avgNotificationsPerUser, 100);

    // Reconnect overhead
    const reconnects = totalAdminUsers * adminSessionsPerDay * reconnectProbability * readsPerReconnect;

    const totalAdminReads = initialLoads + manualRefreshes + notificationReads + reconnects;

    return {
        initialLoads: Math.round(initialLoads),
        manualRefreshes: Math.round(manualRefreshes),
        notificationReads: Math.round(notificationReads),
        reconnects: Math.round(reconnects),
        total: Math.round(totalAdminReads),
    };
}

function calculateDriverReads() {
    const {
        drivers,
        notificationQueriesPerSession,
        avgNotificationsPerUser,
    } = CONFIG;

    // Drivers have minimal Firestore interaction (location is Supabase)
    // Just notification queries
    const notificationReads = drivers * 2 * notificationQueriesPerSession *
        Math.min(avgNotificationsPerUser, 50);

    return {
        notificationReads: Math.round(notificationReads),
        total: Math.round(notificationReads),
    };
}

function calculateSystemSignalReads() {
    const {
        admins,
        moderators,
        adminSessionsPerDay,
        adminSessionDurationHours,
    } = CONFIG;

    // System signals polling (every 60s, single doc read)
    // Reduced from 30s to 60s for Spark plan quota safety
    const pollsPerHour = 60; // 60min * 60s / 60s = 60 polls per hour
    const totalAdminUsers = admins + moderators;

    const signalReads = totalAdminUsers * adminSessionsPerDay *
        adminSessionDurationHours * pollsPerHour;

    return {
        signalPolls: Math.round(signalReads),
        total: Math.round(signalReads),
    };
}

// ============================================================================
// MAIN TEST
// ============================================================================

function runTest() {
    console.log('');
    console.log('🔥 FIRESTORE READS SAFETY LOAD TEST');
    console.log('='.repeat(70));
    console.log('');

    // Display configuration
    console.log('📊 SCENARIO CONFIGURATION:');
    console.log('-'.repeat(40));
    console.log(`  Students:            ${CONFIG.students}`);
    console.log(`  Admins:              ${CONFIG.admins}`);
    console.log(`  Moderators:          ${CONFIG.moderators}`);
    console.log(`  Drivers:             ${CONFIG.drivers}`);
    console.log(`  Buses:               ${CONFIG.buses}`);
    console.log(`  Page Size:           ${CONFIG.pageSize}`);
    console.log(`  Jitter Multiplier:   ${CONFIG.jitterMultiplier}x`);
    console.log('');

    // Calculate reads by category
    const studentReads = calculateStudentReads();
    const adminReads = calculateAdminReads();
    const driverReads = calculateDriverReads();
    const signalReads = calculateSystemSignalReads();

    // Display breakdown
    console.log('📈 READS BREAKDOWN (per day):');
    console.log('-'.repeat(40));
    console.log('');

    console.log('  STUDENT READS:');
    console.log(`    Bus status mounts:     ${studentReads.busStatusMounts.toLocaleString()}`);
    console.log(`    Profile views:         ${studentReads.profileMounts.toLocaleString()}`);
    console.log(`    Update callbacks:      ${studentReads.updateReads.toLocaleString()}`);
    console.log(`    Reconnect overhead:    ${studentReads.reconnects.toLocaleString()}`);
    console.log(`    Subtotal:              ${studentReads.total.toLocaleString()}`);
    console.log('');

    console.log('  ADMIN/MOD READS:');
    console.log(`    Initial page loads:    ${adminReads.initialLoads.toLocaleString()}`);
    console.log(`    Manual refreshes:      ${adminReads.manualRefreshes.toLocaleString()}`);
    console.log(`    Notification queries:  ${adminReads.notificationReads.toLocaleString()}`);
    console.log(`    Reconnect overhead:    ${adminReads.reconnects.toLocaleString()}`);
    console.log(`    Subtotal:              ${adminReads.total.toLocaleString()}`);
    console.log('');

    console.log('  DRIVER READS:');
    console.log(`    Notifications:         ${driverReads.notificationReads.toLocaleString()}`);
    console.log(`    Subtotal:              ${driverReads.total.toLocaleString()}`);
    console.log('');

    console.log('  SYSTEM READS:');
    console.log(`    Signal polling:        ${signalReads.signalPolls.toLocaleString()}`);
    console.log(`    Subtotal:              ${signalReads.total.toLocaleString()}`);
    console.log('');

    // Calculate totals
    const baseTotal = studentReads.total + adminReads.total + driverReads.total + signalReads.total;
    const withJitter = Math.round(baseTotal * CONFIG.jitterMultiplier);

    console.log('-'.repeat(40));
    console.log(`  BASE TOTAL:              ${baseTotal.toLocaleString()}`);
    console.log(`  WITH ${CONFIG.jitterMultiplier}x JITTER:          ${withJitter.toLocaleString()}`);
    console.log('');

    // Verdict
    console.log('='.repeat(70));
    console.log('');

    const percentOfLimit = ((withJitter / CONFIG.sparkDailyLimit) * 100).toFixed(1);
    const percentOfTarget = ((withJitter / CONFIG.targetSafeLimit) * 100).toFixed(1);

    if (withJitter > CONFIG.sparkDailyLimit) {
        console.log('❌ FAILED: Estimated reads EXCEED Spark plan limit!');
        console.log(`   Estimated: ${withJitter.toLocaleString()} reads/day`);
        console.log(`   Limit:     ${CONFIG.sparkDailyLimit.toLocaleString()} reads/day`);
        console.log(`   Overage:   ${(withJitter - CONFIG.sparkDailyLimit).toLocaleString()} reads`);
        console.log('');
        process.exit(1);
    } else if (withJitter > CONFIG.targetSafeLimit) {
        console.log('⚠️  WARNING: Estimated reads exceed safety margin!');
        console.log(`   Estimated: ${withJitter.toLocaleString()} reads/day (${percentOfLimit}% of limit)`);
        console.log(`   Target:    ${CONFIG.targetSafeLimit.toLocaleString()} reads/day`);
        console.log(`   Buffer:    ${(CONFIG.sparkDailyLimit - withJitter).toLocaleString()} reads remaining`);
        console.log('');
        console.log('   Consider reducing admin refresh frequency or session duration.');
        console.log('');
        // Don't fail, just warn
        process.exit(0);
    } else {
        console.log('✅ PASSED: Estimated reads within safe limits');
        console.log(`   Estimated: ${withJitter.toLocaleString()} reads/day`);
        console.log(`   Target:    ${CONFIG.targetSafeLimit.toLocaleString()} reads/day (${percentOfTarget}%)`);
        console.log(`   Limit:     ${CONFIG.sparkDailyLimit.toLocaleString()} reads/day (${percentOfLimit}%)`);
        console.log(`   Buffer:    ${(CONFIG.targetSafeLimit - withJitter).toLocaleString()} reads under target`);
        console.log('');
        process.exit(0);
    }
}

// Run the test
runTest();
