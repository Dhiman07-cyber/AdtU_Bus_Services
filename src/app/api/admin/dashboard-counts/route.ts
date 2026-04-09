/**
 * GET /api/admin/dashboard-counts
 * 
 * PERF: Server-side aggregation of ALL dashboard counts in a single API call.
 * Replaces 12+ individual client-side getCountFromServer queries with ONE
 * server round-trip using Firebase Admin SDK.
 * 
 * Returns: totalStudents, activeStudents, morningStudents, eveningStudents,
 *          totalDrivers, totalBuses, operationalBuses, enrouteBuses,
 *          pendingApplications, pendingVerifications, renewalRequests,
 *          feedbacksCount, allBuses, allRoutes, configDates
 */

import { NextResponse } from 'next/server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';

const DASHBOARD_CACHE_TTL_MS = 30 * 1000;
let dashboardCache: { expiresAt: number; data: any } | null = null;

export const dynamic = 'force-dynamic';

export const GET = withSecurity(
  async (request, { auth, requestId }) => {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: 'Firebase Admin not initialized', requestId },
        { status: 500 }
      );
    }

    try {
      /* Disabling cache to ensure real-time metrics are always fresh */
      /*
      if (dashboardCache && Date.now() < dashboardCache.expiresAt) {
        return NextResponse.json({ success: true, data: dashboardCache.data, requestId });
      }
      */

      // ── 1. Fire ALL Firestore queries in parallel ──
      const [
        studentsSnap,
        driversSnap,
        busesSnap,
        routesSnap,
        pendingAppsSnap,
        verificationSnap,
        renewalSnap,
      ] = await Promise.all([
        adminDb.collection('students').get(),
        adminDb.collection('drivers').count().get(),
        adminDb.collection('buses').get(),
        adminDb.collection('routes').get(),
        adminDb.collection('applications').where('state', '==', 'submitted').count().get(),
        adminDb.collection('applications').where('state', '==', 'awaiting_verification').count().get(),
        adminDb.collection('renewal_requests').where('status', '==', 'pending').count().get(),
      ]);

      // ── 2. Compute student counts from the single snapshot ──
      let totalStudents = 0;
      let activeStudents = 0;
      let morningStudents = 0;
      let eveningStudents = 0;

      studentsSnap.forEach(doc => {
        totalStudents++;
        const d = doc.data();
        if (d.status === 'active') {
          activeStudents++;
          const shift = (d.shift || '').toLowerCase();
          if (shift.includes('morn')) morningStudents++;
          else if (shift.includes('even')) eveningStudents++;
        }
      });

      // ── 3. Compute bus data from single snapshot ──
      const allBuses: any[] = [];
      let operationalBuses = 0;
      let highLoadBusCount = 0;

      busesSnap.forEach(doc => {
        const d = doc.data();
        const currentMembers = d.currentMembers || 0;
        let capacity = 55;
        if (d.totalCapacity) capacity = d.totalCapacity;
        else if (d.capacity) {
          if (typeof d.capacity === 'string' && d.capacity.includes('/')) {
            capacity = parseInt(d.capacity.split('/')[1]) || 55;
          } else if (typeof d.capacity === 'number') {
            capacity = d.capacity;
          }
        }
        const usage = capacity > 0 ? (currentMembers / capacity) * 100 : 0;
        const usagePct = Math.round(usage);

        const status = (d.status || '').toLowerCase();
        if (!['inactive', 'under-maintenance', 'maintenance'].includes(status)) {
          operationalBuses++;
        }
        if (usagePct >= 80) highLoadBusCount++;

        allBuses.push({
          ...d,
          id: doc.id,
          busId: doc.id,
          currentMembers,
          totalCapacity: capacity,
          usagePct,
        });
      });

      // ── 4. Routes ──
      const allRoutes: any[] = [];
      routesSnap.forEach(doc => {
        allRoutes.push({ ...doc.data(), id: doc.id, routeId: doc.id });
      });

      // ── 5. Active trips from Supabase ──
      let activeTripCount = 0;
      let activeTripData: any[] = [];
      try {
        const supabase = getSupabaseServer();
        const { data: statusData, count, error } = await supabase
          .from('driver_status')
          .select('*', { count: 'exact' })
          .in('status', ['enroute', 'on_trip']);

        if (!error && statusData) {
          activeTripCount = count || 0;
          activeTripData = statusData.map(status => {
            const bus = allBuses.find(b => b.busId === status.bus_id || b.id === status.bus_id);
            const route = allRoutes.find(r => r.routeId === status.route_id || r.id === status.route_id);
            return {
              id: status.id,
              busId: bus?.busNumber || status.bus_id || '?',
              routeName: route?.routeName || 'Tracking...',
              driverUid: status.driver_uid,
              startTime: status.started_at || new Date().toISOString(),
              studentCount: bus?.currentMembers || 0,
              status: 'In Motion',
            };
          });
        }
      } catch (e) {
        console.warn('[dashboard-counts] Supabase error:', e);
      }

      // ── 6. Feedback count (last 7 days) ──
      let feedbacksCount = 0;
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fbSnap = await adminDb
          .collection('feedbacks')
          .where('createdAt', '>=', sevenDaysAgo)
          .count()
          .get();
        feedbacksCount = fbSnap.data().count;
      } catch {
        // feedbacks collection might not exist yet
      }

      // ── 7. Config dates ──
      let configDates = {
        academicYearEnd: null as any,
        softBlock: null as any,
        hardBlock: null as any,
        busFee: 0,
      };

      // ── 8. Payment Counts from Supabase ──
      let onlinePayments = 0;
      let offlinePayments = 0;
      let totalRevenue = 0;

      try {
        const sysRef = adminDb.collection('settings').doc('config');
        const dlRef = adminDb.collection('system').doc('deadline_config');
        
        const [sysSnap, dlSnap] = await Promise.all([
          sysRef.get(),
          dlRef.get(),
        ]);
        
        
        const system_data = sysSnap.exists ? sysSnap.data() : null;
        const deadline_data = dlSnap.exists ? dlSnap.data() : null;

        if (system_data) {
          
          // Robust busFee extraction
          if (system_data.busFee && typeof system_data.busFee.amount !== 'undefined') {
            configDates.busFee = Number(system_data.busFee.amount);
          } else if (typeof system_data.busFee === 'number') {
            configDates.busFee = system_data.busFee;
          } else if (typeof system_data.amount === 'number') {
            configDates.busFee = system_data.amount;
          }
        }

        configDates.academicYearEnd = deadline_data?.academicYear
          ? `${deadline_data.academicYear.anchorYear || new Date().getFullYear()}-${String(
              (deadline_data.academicYear.anchorMonth || 0) + 1
            ).padStart(2, '0')}-${String(deadline_data.academicYear.anchorDay || 1).padStart(2, '0')}`
          : system_data?.academicYearEnd || null;

        // ... existing blocks for soft/hard block ...
        configDates.softBlock = deadline_data?.softBlock
          ? `${new Date().getFullYear()}-${String((deadline_data.softBlock.month || 0) + 1).padStart(
              2,
              '0'
            )}-${String(deadline_data.softBlock.day || 1).padStart(2, '0')}`
          : system_data?.softBlock || null;

        configDates.hardBlock = deadline_data?.hardDelete
          ? `${new Date().getFullYear()}-${String((deadline_data.hardDelete.month || 0) + 1).padStart(
              2,
              '0'
            )}-${String(deadline_data.hardDelete.day || 1).padStart(2, '0')}`
          : system_data?.hardBlock || null;

        // Fetch payment counts from Supabase
        const supabase = getSupabaseServer();
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('amount, method, status')
          .or('status.eq.Completed,status.eq.completed');

        if (paymentsError) {
          console.error('[dashboard-counts] Supabase Payment Error:', paymentsError);
        } else if (paymentsData) {
          paymentsData.forEach(p => {
            const method = (p.method || '').toLowerCase().trim();
            if (method === 'online') onlinePayments++;
            else if (method === 'offline') offlinePayments++;
            totalRevenue += Number(p.amount || 0);
          });
        }
      } catch (err) {
        console.error('[dashboard-counts] Critical metric aggregation error:', err);
      }

      // ── 9. Assemble response ──
      const payload = {
        totalStudents,
        activeStudents,
        morningStudents,
        eveningStudents,
        totalDrivers: driversSnap.data().count,
        totalBuses: busesSnap.size,
        operationalBuses,
        activeBuses: activeTripCount,
        enrouteBuses: activeTripCount,
        pendingApplications: pendingAppsSnap.data().count,
        pendingVerifications: verificationSnap.data().count,
        renewalRequests: renewalSnap.data().count,
        feedbacksCount,
        highLoadBusCount,
        totalRevenue,
        onlinePayments,
        offlinePayments,
        configDates,
        allBuses,
        allRoutes,
        activeTrips: activeTripData,
      };
      dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, data: payload };

      return NextResponse.json({
        success: true,
        data: payload,
        requestId,
      });
    } catch (error: any) {
      console.error(`[${requestId}] dashboard-counts error:`, error?.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch dashboard data', requestId },
        { status: 500 }
      );
    }
  },
  {
    requiredRoles: ['admin', 'moderator'],
    rateLimit: RateLimits.ADMIN,
  }
);
