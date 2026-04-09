"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// SPARK PLAN SAFETY: Migrated to usePaginatedCollection
import { usePaginatedCollection } from '@/hooks/usePaginatedCollection';
import { PremiumPageLoader } from '@/components/LoadingSpinner';

import {
  BarChart as BarChartIcon,
} from 'lucide-react';
import HighLoadAlert from '@/components/HighLoadAlert';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
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
  DashboardStats,
  PlatformAnalytics
} from '@/components/admin/dashboard';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { authApiFetch } from '@/lib/secure-api-client';

// ============================================================================
// DASHBOARD CACHING UTILITIES
// ============================================================================
const DASHBOARD_CACHE_KEY = 'adtu_admin_dashboard_cache';
const DASHBOARD_CACHE_EXPIRY_KEY = 'adtu_admin_dashboard_expiry';
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface DashboardCache {
  realCounts: {
    totalStudents: number;
    activeStudents: number;
    totalDrivers: number;
    totalBuses: number;
    activeBuses: number;
    enrouteBuses: number;
    operationalBuses: number;
    morningStudents: number;
    eveningStudents: number;
    pendingApplications: number;
    pendingVerifications: number;
    renewalRequests: number;
    totalRevenue: number;
    onlinePayments: number;
    offlinePayments: number;
    feedbacksCount: number;
    configDates: {
      academicYearEnd: any;
      softBlock: any;
      hardBlock: any;
      busFee: number;
    };
  };
  paymentTrends: { days: any[]; months: any[] };
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
    console.warn('Failed to read dashboard cache:', error);
    return null;
  }
}

function setCachedDashboard(data: DashboardCache): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(DASHBOARD_CACHE_EXPIRY_KEY, (Date.now() + DASHBOARD_CACHE_TTL).toString());
  } catch (error) {
    console.warn('Failed to cache dashboard:', error);
  }
}

export default function EnhancedAdminDashboard() {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const { config: systemConfig, appName, loading: configLoading, refreshConfig } = useSystemConfig();
  const router = useRouter();

  // State
  const [dateRange, setDateRange] = useState('today');
  const [shift, setShift] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize from cache if available for instant display
  const cachedData = typeof window !== 'undefined' ? getCachedDashboard() : null;

  const [paymentTrends, setPaymentTrends] = useState<{ days: any[], months: any[] }>(
    cachedData?.paymentTrends || { days: [], months: [] }
  );
  const [trendMode, setTrendMode] = useState<'days' | 'months'>('days');

  // Accurate Counts State - Initialize from cache for instant display
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

  // Paginated data fetching (on-demand refresh)
  const { data: students, loading: loadingStudents, refresh: refreshStudents } = usePaginatedCollection('students', {
    pageSize: 50, orderByField: 'updatedAt', orderDirection: 'desc', autoRefresh: false,
  });
  const { data: drivers, loading: loadingDrivers, refresh: refreshDrivers } = usePaginatedCollection('drivers', {
    pageSize: 50, orderByField: 'updatedAt', orderDirection: 'desc', autoRefresh: false,
  });
  const { data: buses, loading: loadingBuses, refresh: refreshBuses } = usePaginatedCollection('buses', {
    pageSize: 50, orderByField: 'busNumber', orderDirection: 'asc', autoRefresh: false,
  });
  const { data: applications, loading: loadingApplications, refresh: refreshApplications } = usePaginatedCollection('applications', {
    pageSize: 50, orderByField: 'createdAt', orderDirection: 'desc', autoRefresh: false,
  });
  const { data: notifications, loading: loadingNotifications, refresh: refreshNotifications } = usePaginatedCollection('notifications', {
    pageSize: 50, orderByField: 'createdAt', orderDirection: 'desc', autoRefresh: false,
  });

  // Fetch Accurate Counts - Single API call replaces 12+ individual Firestore queries
  const fetchRealTotalCounts = useCallback(async (modeOverride?: 'days' | 'months') => {
    try {
      if (!currentUser) return;

      // PERF: Fire all API calls in parallel — dashboard-counts replaces 12 Firestore queries
      const [countsRes, resDays, resMonths] = await Promise.all([
        authApiFetch(currentUser, '/api/admin/dashboard-counts'),
        authApiFetch(currentUser, '/api/payment/analytics', { query: { mode: 'days' } }),
        authApiFetch(currentUser, '/api/payment/analytics', { query: { mode: 'months' } }),
      ]);

      // Parse all responses in parallel
      const [countsData, dataDays, dataMonths] = await Promise.all([
        countsRes.json(),
        resDays.json(),
        resMonths.json(),
      ]);

      if (!countsData.success) {
        console.error('Dashboard counts API error:', countsData.error);
        return;
      }

      const d = countsData.data;

      // Payment analytics
      let totalRevenue = 0;
      let newTrends = { days: [] as any[], months: [] as any[] };

      if (dataDays.success && dataDays.data) {
        totalRevenue = dataDays.data.totalRevenue;
        newTrends.days = dataDays.data.trend || [];
      }
      if (dataMonths.success && dataMonths.data) {
        newTrends.months = dataMonths.data.trend || [];
      }

      setPaymentTrends(newTrends);

      const onlineCount = dataDays.data.onlinePayments || 0;
      const offlineCount = dataDays.data.offlinePayments || 0;

      // Set buses and routes from server response (eliminates duplicate getDocs)
      setAllBuses(d.allBuses || []);
      setAllRoutes(d.allRoutes || []);
      setActiveTrips(d.activeTrips || []);

      const newRealCounts = {
        totalStudents: d.totalStudents,
        activeStudents: d.activeStudents,
        totalDrivers: d.totalDrivers,
        totalBuses: d.totalBuses,
        activeBuses: d.activeBuses,
        enrouteBuses: d.enrouteBuses,
        operationalBuses: d.operationalBuses,
        morningStudents: d.morningStudents,
        eveningStudents: d.eveningStudents,
        pendingApplications: d.pendingApplications,
        pendingVerifications: d.pendingVerifications,
        renewalRequests: d.renewalRequests,
        totalRevenue: d.totalRevenue || totalRevenue,
        onlinePayments: d.onlinePayments || onlineCount,
        offlinePayments: d.offlinePayments || offlineCount,
        feedbacksCount: d.feedbacksCount,
        highLoadBusCount: d.highLoadBusCount,
        configDates: d.configDates,
      };

      setRealCounts(newRealCounts);

      // Cache for instant loading on next visit
      setCachedDashboard({
        realCounts: newRealCounts,
        paymentTrends: newTrends,
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    // Fetch both modes on mount
    fetchRealTotalCounts();
  }, [fetchRealTotalCounts]);

  // Extract routes from buses data (since routes are nested in buses) - memoized
  const routes = useMemo(() => {
    return buses.map((bus: any) => {
      if (bus.route) {
        return {
          id: bus.route.routeId,
          routeId: bus.route.routeId,
          routeName: bus.route.routeName,
          totalStops: bus.route.totalStops,
          estimatedTime: bus.route.estimatedTime,
          status: bus.route.status || 'active',
          stops: bus.route.stops || [],
          assignedBuses: bus.route.assignedBuses || [bus.busId],
          defaultBusId: bus.route.defaultBusId,
          currentBusId: bus.route.currentBusId
        };
      }
      return null;
    }).filter(Boolean);
  }, [buses]);

  const allDataLoading = authLoading || loadingStudents || loadingDrivers || loadingBuses || loadingApplications || loadingNotifications || configLoading;

  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    expiringStudents: 0,
    expiredStudents: 0,
    totalDrivers: 0,
    activeDrivers: 0,
    totalBuses: 0,
    activeBuses: 0,
    enrouteBuses: 0,
    operationalBuses: 0,
    totalRoutes: 0,
    totalNotifications: 0,
    unreadNotifications: 0,
    pendingVerifications: 0,
    pendingApplications: 0,
    approvedToday: 0,
    rejectedToday: 0,
    morningStudents: 0,
    eveningStudents: 0,
    totalRevenue: 0,
    onlinePayments: 0,
    offlinePayments: 0,
    academicYearEnd: null as any,
    softBlock: null as any,
    hardBlock: null as any,
    systemBusFee: 0,
    feedbacksCount: 0
  });

  // Manual refresh handler
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshStudents(),
        refreshDrivers(),
        refreshBuses(),
        refreshApplications(),
        refreshNotifications(),
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

  const [busUtilization, setBusUtilization] = useState<any[]>([]);
  const [studentDistribution, setStudentDistribution] = useState<any[]>([]);
  const [applicationTrend, setApplicationTrend] = useState<any[]>([]);
  const [routeOccupancy, setRouteOccupancy] = useState<any[]>([]);
  const [verificationTrend, setVerificationTrend] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);



  // Memoized calculation functions
  const calculateStats = useCallback(() => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activeStudents = students.filter((s: any) =>
      s.status === 'active' && new Date(s.validUntil) > now
    );

    const expiringStudents = activeStudents.filter((s: any) => {
      const expiry = new Date(s.validUntil);
      return expiry > now && expiry <= thirtyDaysFromNow;
    });

    const expiredStudents = students.filter((s: any) =>
      s.status === 'expired'
    );

    const unreadNotifs = notifications.filter((n: any) => {
      // Skip notifications that are drafts or not sent
      if (n.status === 'draft' || n.status === 'pending') {
        return false;
      }

      // Skip application approval notifications (these are for students only)
      if (n.title?.includes('application has been approved') ||
        n.message?.includes('application has been approved') ||
        n.title?.includes('Congratulations') ||
        n.message?.includes('Welcome aboard')) {
        return false;
      }

      // Skip notifications older than 48 hours
      const createdAt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
      const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursOld > 48) {
        return false;
      }

      // If notification has a 'read' property, use it
      if (n.read !== undefined) {
        return !n.read;
      }

      // If notification has 'readStatus' object, check if current user has read it
      if (n.readStatus && currentUser) {
        return !n.readStatus[currentUser.uid];
      }

      // For moderator notifications, check if they're meant for moderator role
      if (n.audience && typeof n.audience === 'object' && n.audience.scope) {
        // This is a system notification, consider it read if it's old
        const daysOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return daysOld < 1; // Consider unread if less than 1 day old
      }

      // If neither exists, consider it unread only if it's recent
      return hoursOld < 24; // Consider unread if less than 24 hours old
    });

    const approvedToday = applications.filter((a: any) =>
      a.state === 'approved' && new Date(a.approvedAt) >= todayStart
    );
    const rejectedToday = applications.filter((a: any) =>
      a.state === 'rejected' && new Date(a.rejectedAt) >= todayStart
    );

    setStats({
      totalStudents: realCounts.totalStudents,
      activeStudents: realCounts.activeStudents,
      expiringStudents: expiringStudents.length,
      expiredStudents: expiredStudents.length,
      totalDrivers: realCounts.totalDrivers,
      activeDrivers: drivers.filter((d: any) => d.assignedBusId || d.busId).length,
      totalBuses: realCounts.totalBuses,
      activeBuses: realCounts.enrouteBuses, // Repurposed for trips
      enrouteBuses: realCounts.enrouteBuses,
      operationalBuses: realCounts.operationalBuses,
      totalRoutes: routes.length,
      totalNotifications: notifications.length,
      unreadNotifications: unreadNotifs.length,
      pendingVerifications: realCounts.renewalRequests, // Showing Renewal Requests as "Pending Verification" as requested
      pendingApplications: realCounts.pendingApplications,
      approvedToday: approvedToday.length,
      rejectedToday: rejectedToday.length,
      morningStudents: realCounts.morningStudents,
      eveningStudents: realCounts.eveningStudents,
      totalRevenue: realCounts.totalRevenue,
      onlinePayments: realCounts.onlinePayments,
      offlinePayments: realCounts.offlinePayments,
      academicYearEnd: realCounts.configDates.academicYearEnd,
      softBlock: realCounts.configDates.softBlock,
      hardBlock: realCounts.configDates.hardBlock,
      systemBusFee: realCounts.configDates.busFee,
      feedbacksCount: realCounts.feedbacksCount
    });
  }, [students, drivers, buses, routes, applications, notifications, realCounts]);

  // Memoized calculation functions
  const calculateCharts = useCallback(() => {
    // Bus utilization with enhanced data and sorting
    // Use allBuses if available, otherwise fall back to paginated buses (though paginated is likely insufficient)
    const busesToUse = allBuses.length > 0 ? allBuses : buses;
    const busUtilData = busesToUse.map((bus: any) => {
      // Use currentMembers and totalCapacity from bus document (correct Firestore fields)
      const currentMembers = bus.currentMembers || 0;
      let capacity = 55; // Default

      // Get capacity from totalCapacity field (primary), or parse from capacity field if needed
      if (bus.totalCapacity) {
        capacity = bus.totalCapacity;
      } else if (bus.capacity) {
        if (typeof bus.capacity === 'string' && bus.capacity.includes('/')) {
          capacity = parseInt(bus.capacity.split('/')[1]) || 55;
        } else if (typeof bus.capacity === 'number') {
          capacity = bus.capacity;
        }
      }

      const utilization = capacity > 0 ? (currentMembers / capacity) * 100 : 0;
      const load = bus.load || {};
      const morningCount = load.morningCount || 0;
      const eveningCount = load.eveningCount || 0;

      return {
        name: `Bus ${extractNumber(bus.busId || bus.id)}`,
        students: currentMembers,
        capacity,
        utilization: Math.round(utilization),
        morningCount,
        eveningCount
      };
    }).sort((a, b) => {
      // Sort by bus number in ascending order (Bus 1, Bus 2, etc.)
      const aNum = parseInt(a.name.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.name.replace(/\D/g, '')) || 0;
      return aNum - bNum;
    });
    setBusUtilization(busUtilData);

    // Student distribution by shift - Use realCounts for total dataset accuracy
    // Use realCounts directly to avoid stale state issues with 'stats'
    const morningCount = realCounts.morningStudents;
    const eveningCount = realCounts.eveningStudents;


    setStudentDistribution([
      { name: 'Evening', value: eveningCount || 0, color: '#3b82f6' }, // Blue
      { name: 'Morning', value: morningCount || 0, color: '#f97316' }  // Orange
    ].filter(i => true)); // Keep both to ensure legend shows even if 0, or logic to handle small values

    // Route occupancy data - sorted by occupancy rate (highest first)
    const routesToUse = allRoutes.length > 0 ? allRoutes : [];
    // Just in case routes are nested in buses or stored separately.
    // Assuming 'routes' collection is primary source for route definitions

    // We need to map routes to buses.
    // If allRoutes is empty, we can try to extract from buses if they have embedded route info, but usually collections are better.

    const routeOccupancyData = routesToUse.map((route: any) => {
      // Find all buses assigned to this route
      const routeBuses = allBuses.filter((b: any) => b.routeId === route.routeId || b.route?.routeId === route.routeId);

      if (routeBuses.length === 0) {
        return {
          name: route.routeName,
          occupancy: 0,
          students: 0,
          capacity: 0
        };
      }

      // Calculate total capacity and current load across all buses for this route
      let totalCapacity = 0;
      let totalCurrentLoad = 0;

      routeBuses.forEach((bus: any) => {
        // Get bus capacity
        let capacity = 50; // Default
        if (bus.capacity) {
          if (typeof bus.capacity === 'string' && bus.capacity.includes('/')) {
            capacity = parseInt(bus.capacity.split('/')[1]) || 50;
          } else if (typeof bus.capacity === 'number') {
            capacity = bus.capacity;
          } else if (bus.totalCapacity) {
            capacity = bus.totalCapacity;
          }
        }

        totalCapacity += capacity;
        totalCapacity += capacity;
        // Use currentMembers from bus document for accurate real-time data or calculate from students
        let busLoad = bus.currentMembers || 0;
        if (busLoad === 0 && students.length > 0) {
          // Fallback: calculate from students data if available
          busLoad = students.filter((s: any) => s.busId === bus.busId && s.status === 'active').length;
        }
        totalCurrentLoad += busLoad;
      });

      const occupancy = totalCapacity > 0 ? Math.min(Math.round((totalCurrentLoad / totalCapacity) * 100), 100) : 0;

      return {
        name: route.routeName,
        occupancy,
        students: totalCurrentLoad,
        capacity: totalCapacity
      };
    })
      .filter(r => r.capacity > 0) // Only include routes with buses
      .sort((a, b) => b.occupancy - a.occupancy) // Sort by occupancy (descending)
      .slice(0, 8); // Take top 8
    setRouteOccupancy(routeOccupancyData);

    // Application trend (last 7 days) with enhanced data
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date;
    });

    const trendData = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const submitted = applications.filter((a: any) =>
        a.submittedAt?.startsWith(dateStr)
      ).length;
      const approved = applications.filter((a: any) =>
        a.approvedAt?.startsWith(dateStr)
      ).length;
      const rejected = applications.filter((a: any) =>
        a.rejectedAt?.startsWith(dateStr)
      ).length;

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        submitted,
        approved,
        rejected
      };
    });
    setApplicationTrend(trendData);

    // Verification trend (last 7 days)
    const verificationData = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const awaitingVerification = applications.filter((a: any) =>
        a.state === 'awaiting_verification' && a.submittedAt?.startsWith(dateStr)
      ).length;
      const verified = applications.filter((a: any) =>
        a.verifiedAt?.startsWith(dateStr)
      ).length;

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        awaiting: awaitingVerification,
        verified
      };
    });
    setVerificationTrend(verificationData);

    // Active trips simulation (similar to admin dashboard)
    // Supabase will handle active trips count and details via fetchRealTotalCounts
    // No more simulation needed here
  }, [students, drivers, buses, routes, applications, allBuses, allRoutes, realCounts]);

  // Helper function for extracting numbers from strings
  const extractNumber = (str: string): string => {
    const match = str?.match(/\d+/);
    return match ? match[0] : '?';
  };

  // Calculate stats when data changes
  useEffect(() => {
    if (students && drivers && buses && routes && applications && notifications) {
      calculateStats();
      calculateCharts();
    }
  }, [students, drivers, buses, routes, applications, notifications, calculateStats, calculateCharts]);

  // Update timestamp when data changes
  useEffect(() => {
    if (!allDataLoading) {
      setLastUpdated(new Date());
    }
  }, [allDataLoading, students, drivers, buses, routes, notifications]);


  if (allDataLoading && students.length === 0 && drivers.length === 0 && buses.length === 0) {
    return <PremiumPageLoader fullScreen message="Curating Dashboard Experience..." subMessage="Fetching system status and analytics..." />;
  }

  // Get first name from user data
  const getFirstName = () => {
    if (!userData) return 'Admin';
    const fullName = (userData as any).fullName || (userData as any).name || userData.email || '';
    return fullName.split(' ')[0] || 'Admin';
  };

  // Handle KPI card clicks
  const handleKpiClick = (path: string) => {
    router.push(path);
  };

  // Empty state component for charts
  const EmptyChartState = ({ title, description }: { title: string; description: string }) => (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <BarChartIcon className="h-12 w-12 mb-4 opacity-50" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-center">{description}</p>
    </div>
  );

  return (
    <div className="flex-1 bg-[#05060e] min-h-screen relative overflow-hidden transition-all duration-700">
      {/* Background Ambience Bloom */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute bottom-0 right-1/4 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
      </div>

      <div className="px-6 md:px-12 pt-17 md:pt-17 pb-20 relative z-10 max-w-screen-2xl mx-auto space-y-4">
        {/* HEADER AREA */}
        <DashboardHeader
          firstName={getFirstName()}
          lastUpdated={lastUpdated}
          isRefreshing={isRefreshing}
          onRefresh={handleRefreshAll}
          stats={stats as any as DashboardStats}
        />

        {/* SECTION 1: SYSTEM HEALTH STRIP */}
        <div className="w-full">
          <SystemHealthStrip stats={stats as any as DashboardStats} />
        </div>

        {/* SECTION: CRITICAL ALERT (Preserving unchanged) */}
        <div className="mb-2">
          <HighLoadAlert role="admin" className="animate-in fade-in slide-in-from-top-4 duration-700 h-auto" />
        </div>

        {/* SECTION 2: PRIMARY SNAPSHOT (HERO ZONE) */}
        <HeroLiveOperations
          activeTrips={activeTrips}
          totalBuses={stats.totalBuses}
          totalStudents={stats.totalStudents}
          stats={stats as any as DashboardStats}
          allBuses={allBuses}
          allRoutes={allRoutes}
          allDrivers={drivers}
        />

        {/* SECTION 2.1: PLATFORM ANALYTICS (GA4 INTEGRATION) */}
        <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <PlatformAnalytics />
        </div>

        {/* SECTION 3: KEY METRICS BLOCKS */}
        <KeyMetricsGrid stats={stats as any as DashboardStats} />

        {/* SECTION 4: TRANSACTIONAL ANALYTICS */}
        <TransactionalAnalytics paymentTrends={paymentTrends as any} />

        {/* ROW: BUS & ROUTE DYNAMICS */}
        <div className="grid grid-cols-1 gap-12">
          {/* SECTION 5: BUS UTILIZATION */}
          <BusUtilization busUtilization={busUtilization} />

          {/* SECTION 6: ROUTE OCCUPANCY */}
          <RouteOccupancy routeOccupancy={routeOccupancy} busUtilization={busUtilization} />
        </div>

        {/* ROW: DISTRIBUTION & STAFFING */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SECTION 7: STUDENT DISTRIBUTION */}
          <StudentDistribution
            distribution={studentDistribution}
            totalStudents={stats.activeStudents}
          />

          {/* SECTION 8: SYSTEM LIFECYCLE INTELLIGENCE */}
          <SystemLifecycleIntelligence stats={stats as any as DashboardStats} />
        </div>

        {/* SECTION 10: QUICK ACTIONS */}
        <QuickActions />
      </div>
    </div>
  );
}
