"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { PremiumPageLoader } from '@/components/LoadingSpinner';

import {
  DashboardHeader,
  SystemHealthStrip,
  HeroLiveOperations,
  KeyMetricsGrid,
  TransactionalAnalytics,
  BusUtilization,
  RouteOccupancy,
  StudentDistribution,
  SystemLifecycleIntelligence,
  QuickActions,
  DashboardStats
} from '@/components/admin/dashboard';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { authApiFetch } from '@/lib/secure-api-client';
import HighLoadAlert from '@/components/HighLoadAlert';

const DASHBOARD_CACHE_KEY = 'adtu_moderator_dashboard_cache_v2';
const DASHBOARD_CACHE_EXPIRY_KEY = 'adtu_moderator_dashboard_expiry_v2';
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface DashboardCache {
  realCounts: any;
  paymentTrends: { days: any[]; months: any[]; methodTrend: any[] };
}

function getCachedDashboard(): DashboardCache | null {
  try {
    if (typeof window === 'undefined') return null;
    const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
    const expiry = localStorage.getItem(DASHBOARD_CACHE_EXPIRY_KEY);
    if (!cached || !expiry) return null;
    if (Date.now() > parseInt(expiry)) {
      localStorage.removeItem(DASHBOARD_CACHE_KEY);
      localStorage.removeItem(DASHBOARD_CACHE_EXPIRY_KEY);
      return null;
    }
    return JSON.parse(cached);
  } catch (error) {
    console.warn('Failed to read moderator dashboard cache:', error);
    return null;
  }
}

function setCachedDashboard(data: DashboardCache): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(DASHBOARD_CACHE_EXPIRY_KEY, (Date.now() + DASHBOARD_CACHE_TTL).toString());
  } catch (error) {
    console.warn('Failed to cache moderator dashboard:', error);
  }
}

export default function EnhancedModeratorDashboard() {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const { config: systemConfig, loading: configLoading, refreshConfig } = useSystemConfig();
  const router = useRouter();

  // State
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize from cache if available
  const cachedData = typeof window !== 'undefined' ? getCachedDashboard() : null;

  const [paymentTrends, setPaymentTrends] = useState<{ days: any[], months: any[], methodTrend: any[] }>(
    cachedData?.paymentTrends || { days: [], months: [], methodTrend: [] }
  );

  const [realCounts, setRealCounts] = useState(cachedData?.realCounts || {
    totalStudents: 0,
    activeStudents: 0,
    totalDrivers: 0,
    totalBuses: 0,
    activeBuses: 0,
    enrouteBuses: 0,
    operationalBuses: 0,
    morningStudents: 0,
    eveningStudents: 0,
    pendingApplications: 0,
    pendingVerifications: 0,
    renewalRequests: 0,
    totalRevenue: 0,
    onlinePayments: 0,
    offlinePayments: 0,
    feedbacksCount: 0,
    highLoadBusCount: 0,
    configDates: {
      academicYearEnd: null,
      softBlock: null,
      hardBlock: null,
      busFee: 0
    }
  });

  const [allBuses, setAllBuses] = useState<any[]>([]);
  const [allRoutes, setAllRoutes] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);

  const fetchRealTotalCounts = useCallback(async () => {
    try {
      if (!currentUser) return;

      const [countsRes, resDays, resMonths] = await Promise.all([
        authApiFetch(currentUser, '/api/admin/dashboard-counts'),
        authApiFetch(currentUser, '/api/payment/analytics', { query: { mode: 'days' } }),
        authApiFetch(currentUser, '/api/payment/analytics', { query: { mode: 'months' } }),
      ]);

      const [countsData, dataDays, dataMonths] = await Promise.all([
        countsRes.json(),
        resDays.json(),
        resMonths.json(),
      ]);

      if (!countsData.success) return;

      const d = countsData.data;
      let totalRevenue = 0;
      let onlinePayments = 0;
      let offlinePayments = 0;
      let methodTrend = [];
      let newTrends = { days: [] as any[], months: [] as any[], methodTrend: [] as any[] };

      if (dataDays.success && dataDays.data) {
        totalRevenue = dataDays.data.totalRevenue;
        onlinePayments = dataDays.data.onlinePayments || 0;
        offlinePayments = dataDays.data.offlinePayments || 0;
        methodTrend = dataDays.data.methodTrend || [];
        newTrends.days = dataDays.data.trend || [];
        newTrends.methodTrend = methodTrend;
      }
      if (dataMonths.success && dataMonths.data) {
        newTrends.months = dataMonths.data.trend || [];
      }

      setPaymentTrends(newTrends);
      setAllBuses(d.allBuses || []);
      setAllRoutes(d.allRoutes || []);
      setActiveTrips(d.activeTrips || []);

      const newRealCounts = {
        ...d,
        totalRevenue: d.totalRevenue || totalRevenue,
        onlinePayments: d.onlinePayments || onlinePayments,
        offlinePayments: d.offlinePayments || offlinePayments,
      };

      setRealCounts(newRealCounts);

      setCachedDashboard({
        realCounts: newRealCounts,
        paymentTrends: newTrends,
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchRealTotalCounts();
  }, [fetchRealTotalCounts]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchRealTotalCounts(),
        refreshConfig()
      ]);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const busUtilization = useMemo(() => {
    return allBuses.map((bus: any) => ({
      name: `Bus ${bus.busNumber || bus.id}`,
      students: bus.currentMembers || 0,
      capacity: bus.totalCapacity || 55,
      utilization: bus.usagePct || 0,
      morningCount: bus.load?.morningCount || 0,
      eveningCount: bus.load?.eveningCount || 0
    })).sort((a, b) => {
      const aNum = parseInt(a.name.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.name.replace(/\D/g, '')) || 0;
      return aNum - bNum;
    });
  }, [allBuses]);

  const studentDistribution = useMemo(() => [
    { name: 'Evening', value: realCounts.eveningStudents || 0, color: '#3b82f6' },
    { name: 'Morning', value: realCounts.morningStudents || 0, color: '#f97316' }
  ], [realCounts]);

  const routeOccupancy = useMemo(() => {
    return allRoutes.map((route: any) => {
      const routeBuses = allBuses.filter((b: any) => b.routeId === route.id || b.route?.routeId === route.id);
      let totalCap = 0;
      let totalLoad = 0;
      routeBuses.forEach(b => {
        totalCap += b.totalCapacity || 55;
        totalLoad += b.currentMembers || 0;
      });
      return {
        name: route.routeName,
        occupancy: totalCap > 0 ? Math.round((totalLoad / totalCap) * 100) : 0,
        students: totalLoad,
        capacity: totalCap
      };
    }).filter(r => r.capacity > 0).sort((a, b) => b.occupancy - a.occupancy).slice(0, 8);
  }, [allRoutes, allBuses]);

  const stats: DashboardStats = {
    totalStudents: realCounts.totalStudents,
    activeStudents: realCounts.activeStudents,
    expiringStudents: 0, // Simplified for moderator
    expiredStudents: 0,
    totalDrivers: realCounts.totalDrivers,
    activeDrivers: realCounts.totalDrivers, // Simplified
    totalBuses: realCounts.totalBuses,
    activeBuses: realCounts.enrouteBuses,
    enrouteBuses: realCounts.enrouteBuses,
    operationalBuses: realCounts.operationalBuses,
    totalRoutes: allRoutes.length,
    totalNotifications: 0,
    unreadNotifications: 0,
    pendingVerifications: realCounts.renewalRequests,
    pendingApplications: realCounts.pendingApplications,
    approvedToday: 0,
    rejectedToday: 0,
    morningStudents: realCounts.morningStudents,
    eveningStudents: realCounts.eveningStudents,
    totalRevenue: realCounts.totalRevenue,
    onlinePayments: realCounts.onlinePayments,
    offlinePayments: realCounts.offlinePayments,
    academicYearEnd: realCounts.configDates?.academicYearEnd,
    softBlock: realCounts.configDates?.softBlock,
    hardBlock: realCounts.configDates?.hardBlock,
    systemBusFee: realCounts.configDates?.busFee || 0,
    feedbacksCount: realCounts.feedbacksCount
  };

  if (authLoading || (realCounts.totalStudents === 0 && !cachedData)) {
    return <PremiumPageLoader fullScreen message="Curating Moderator Experience..." subMessage="Fetching system status and analytics..." />;
  }

  const getFirstName = () => {
    if (!userData) return 'Moderator';
    const fullName = (userData as any).fullName || (userData as any).name || userData.email || '';
    return fullName.split(' ')[0] || 'Moderator';
  };

  return (
    <div className="flex-1 bg-[#05060e] min-h-screen relative overflow-hidden transition-all duration-700">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="px-6 md:px-12 pt-17 pb-20 relative z-10 max-w-screen-2xl mx-auto space-y-4">
        <DashboardHeader
          firstName={getFirstName()}
          lastUpdated={lastUpdated}
          isRefreshing={isRefreshing}
          onRefresh={handleRefreshAll}
          stats={stats}
          role="moderator"
        />

        <div className="w-full">
          <SystemHealthStrip stats={stats} />
        </div>

        <div className="mb-2">
          <HighLoadAlert role="moderator" className="animate-in fade-in slide-in-from-top-4 duration-700" />
        </div>

        <HeroLiveOperations
          activeTrips={activeTrips}
          totalBuses={stats.totalBuses}
          totalStudents={stats.totalStudents}
          stats={stats}
          allBuses={allBuses}
          allRoutes={allRoutes}
          allDrivers={[]} // Simplified
          role="moderator"
        />

        <KeyMetricsGrid stats={stats} role="moderator" />



        <div className="grid grid-cols-1 gap-12">
          <BusUtilization busUtilization={busUtilization} />
          <RouteOccupancy routeOccupancy={routeOccupancy} busUtilization={busUtilization} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <StudentDistribution
            distribution={studentDistribution}
            totalStudents={stats.activeStudents}
          />
          <SystemLifecycleIntelligence stats={stats} />
        </div>

        <QuickActions role="moderator" />
      </div>
    </div>
  );
}
