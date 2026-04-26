import { NextResponse } from 'next/server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';

/**
 * GET /api/admin/dashboard-counts
 * 
 * Optimized:
 * - Parallelized fetching across Firestore AND Supabase.
 * - Single pass processing of collection snapshots.
 * - Robust error handling with partial data fallback.
 */

export const dynamic = 'force-dynamic';

export const GET = withSecurity(
  async (request, { auth, requestId }) => {
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized', requestId }, { status: 500 });
    }

    try {
      const supabase = getSupabaseServer();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // ── 1. Fire ALL distributed queries in parallel (Firestore & Supabase) ──
      const [
        totalStudentsSnap,
        activeStudentsSnap,
        morningStudentsSnap,
        eveningStudentsSnap,
        driversSnap,
        busesSnap,
        routesSnap,
        pendingAppsSnap,
        verificationSnap,
        renewalSnap,
        feedbackSnap,
        statusSnap,
        paymentsSnap,
        sysSnap,
        dlSnap
      ] = await Promise.all([
        adminDb.collection('students').count().get(),
        adminDb.collection('students').where('status', '==', 'active').count().get(),
        adminDb.collection('students').where('status', '==', 'active').where('shift', '==', 'Morning').count().get(),
        adminDb.collection('students').where('status', '==', 'active').where('shift', '==', 'Evening').count().get(),
        adminDb.collection('drivers').count().get(),
        adminDb.collection('buses').get(),
        adminDb.collection('routes').get(),
        adminDb.collection('applications').where('state', '==', 'submitted').count().get(),
        adminDb.collection('applications').where('state', '==', 'awaiting_verification').count().get(),
        adminDb.collection('renewal_requests').where('status', '==', 'pending').count().get(),
        adminDb.collection('feedbacks').where('createdAt', '>=', sevenDaysAgo).count().get().catch(() => ({ data: () => ({ count: 0 }) })),
        supabase.from('driver_status').select('*').in('status', ['enroute', 'on_trip']),
        supabase.from('payments').select('amount, method').or('status.eq.Completed,status.eq.completed'),
        adminDb.collection('settings').doc('config').get(),
        adminDb.collection('system').doc('deadline_config').get()
      ]);

      // ── 2. Process Routes & Buses ──
      const allRoutes = routesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, routeId: doc.id }));
      const allBuses: any[] = [];
      let operationalBuses = 0;
      let highLoadBusCount = 0;

      busesSnap.forEach(doc => {
        const d = doc.data();
        const currentMembers = d.currentMembers || 0;
        let capacity = 55;
        if (d.totalCapacity) capacity = d.totalCapacity;
        else if (d.capacity) {
            if (typeof d.capacity === 'string' && d.capacity.includes('/')) capacity = parseInt(d.capacity.split('/')[1]) || 55;
            else if (typeof d.capacity === 'number') capacity = d.capacity;
        }
        const usagePct = capacity > 0 ? Math.round((currentMembers / capacity) * 100) : 0;
        if (!['inactive', 'under-maintenance', 'maintenance'].includes((d.status || '').toLowerCase())) operationalBuses++;
        if (usagePct >= 80) highLoadBusCount++;

        allBuses.push({ ...d, id: doc.id, busId: doc.id, currentMembers, totalCapacity: capacity, usagePct });
      });

      // ── 3. Process Students (Optimized via count()) ──
      const totalStudents = totalStudentsSnap.data().count;
      const activeStudents = activeStudentsSnap.data().count;
      const morningStudents = morningStudentsSnap.data().count;
      const eveningStudents = eveningStudentsSnap.data().count;

      // ── 4. Process Active Trips (Supabase) ──
      const activeTripData = (statusSnap.data || []).map(status => {
        const bus = allBuses.find(b => b.busId === status.bus_id);
        const route = allRoutes.find(r => r.routeId === status.route_id);
        return {
          id: status.id, busId: bus?.busNumber || status.bus_id || '?',
          routeName: route?.routeName || 'Tracking...', driverUid: status.driver_uid,
          startTime: status.started_at || new Date().toISOString(),
          studentCount: bus?.currentMembers || 0, status: 'In Motion',
        };
      });

      // ── 5. Process Payments (Supabase) ──
      let onlinePayments = 0, offlinePayments = 0, totalRevenue = 0;
      (paymentsSnap.data || []).forEach(p => {
        const method = (p.method || '').toLowerCase().trim();
        if (method === 'online') onlinePayments++;
        else offlinePayments++;
        totalRevenue += Number(p.amount || 0);
      });

      // ── 6. Config Dates ──
      const systemData = sysSnap.exists ? sysSnap.data() : null;
      const dlData = dlSnap.exists ? dlSnap.data() : null;
      const configDates = {
        academicYearEnd: dlData?.academicYear ? `${dlData.academicYear.anchorYear || new Date().getFullYear()}-${String((dlData.academicYear.anchorMonth || 0) + 1).padStart(2, '0')}-${String(dlData.academicYear.anchorDay || 1).padStart(2, '0')}` : systemData?.academicYearEnd || null,
        softBlock: dlData?.softBlock ? `${new Date().getFullYear()}-${String((dlData.softBlock.month || 0) + 1).padStart(2, '0')}-${String(dlData.softBlock.day || 1).padStart(2, '0')}` : systemData?.softBlock || null,
        hardBlock: dlData?.hardDelete ? `${new Date().getFullYear()}-${String((dlData.hardDelete.month || 0) + 1).padStart(2, '0')}-${String(dlData.hardDelete.day || 1).padStart(2, '0')}` : systemData?.hardBlock || null,
        busFee: Number(systemData?.busFee?.amount || systemData?.busFee || systemData?.amount || 0)
      };

      const payload = {
        totalStudents, activeStudents, morningStudents, eveningStudents,
        totalDrivers: driversSnap.data().count, totalBuses: busesSnap.size,
        operationalBuses, activeBuses: statusSnap.data?.length || 0,
        enrouteBuses: statusSnap.data?.length || 0,
        pendingApplications: pendingAppsSnap.data().count,
        pendingVerifications: verificationSnap.data().count,
        renewalRequests: renewalSnap.data().count,
        feedbacksCount: feedbackSnap.data().count,
        highLoadBusCount, totalRevenue, onlinePayments, offlinePayments,
        configDates, allBuses, allRoutes, activeTrips: activeTripData,
      };

      return NextResponse.json({ success: true, data: payload, requestId });
    } catch (error: any) {
      console.error(`[${requestId}] dashboard-counts error:`, error?.message);
      return NextResponse.json({ success: false, error: 'Failed to aggregate dashboard data', requestId }, { status: 500 });
    }
  },
  {
    requiredRoles: ['admin', 'moderator'],
    rateLimit: RateLimits.ADMIN,
  }
);
