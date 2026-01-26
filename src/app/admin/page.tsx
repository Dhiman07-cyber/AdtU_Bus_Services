"use client";

/**
 * Premium Admin Dashboard
 * - Optimized data fetching with pagination
 * - Enhanced KPI cards with premium styling
 * - Dark theme matching admin dashboard exactly
 * - Advanced visual representations and analytics
 * - Professional UX with smooth animations
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// SPARK PLAN SAFETY: Migrated to usePaginatedCollection
import { usePaginatedCollection } from '@/hooks/usePaginatedCollection';
import { FullScreenLoader } from '@/components/LoadingSpinner';

import {
  Users,
  Bus,
  UserCheck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Activity,
  BarChart3,
  FileText,
  Shield,
  Bell,
  Route as RouteIcon,
  User,
  MessageSquare,
  PlayCircle,
  Download,
  RefreshCw,
  Filter,
  PieChart as PieChartIcon,
  Clock as ClockIcon,
  User as UserIcon,
  MessageSquare as MessageSquareIcon,
  BarChart as BarChartIcon,
  TrendingUp as TrendingUpIcon,
  Sun,
  Moon
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { auth } from '@/lib/firebase';
import { CreditCard, Wallet } from 'lucide-react';
import HighLoadAlert from '@/components/HighLoadAlert';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
import { ActiveTripsCard } from '@/components/dashboard/ActiveTripsCard';
import { useSystemConfig } from '@/contexts/SystemConfigContext';

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
  const [paymentTrend, setPaymentTrend] = useState<any[]>([]);
  const [trendMode, setTrendMode] = useState<'days' | 'months'>('days');

  // Accurate Counts State
  const [realCounts, setRealCounts] = useState({
    totalStudents: 0,
    activeStudents: 0,
    totalDrivers: 0,
    totalBuses: 0,
    activeBuses: 0,
    morningStudents: 0,
    eveningStudents: 0,
    pendingApplications: 0,

    pendingVerifications: 0,
    renewalRequests: 0,
    totalRevenue: 0
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

  // Fetch Accurate Counts
  const fetchRealTotalCounts = async () => {
    try {
      const { getCountFromServer, collection, query, where, getDocs } = await import('firebase/firestore');
      const { db, auth } = await import('@/lib/firebase');

      // 1. Students
      // 1. Students - Aggregation for Total, Manual Filter for Active
      const studentsColl = collection(db, 'students');
      const totalStudentsSnap = await getCountFromServer(studentsColl);

      // Fetch all 'active' students to apply complex filters (Soft Block check, Google Login check)
      const activeStudentsQuery = query(studentsColl, where('status', '==', 'active'));
      const activeStudentsSnapDoc = await getDocs(activeStudentsQuery);

      const activeStudentsFiltered = activeStudentsSnapDoc.docs.map(doc => doc.data());

      const activeCount = activeStudentsFiltered.length;
      const morningCount = activeStudentsFiltered.filter((s: any) => s.shift?.toLowerCase() === 'morning').length;
      const eveningCount = activeStudentsFiltered.filter((s: any) => s.shift?.toLowerCase() === 'evening').length;

      // 2. Drivers, Buses
      const driversColl = collection(db, 'drivers');
      const totalDriversSnap = await getCountFromServer(driversColl);

      const busesColl = collection(db, 'buses');
      const totalBusesSnap = await getCountFromServer(busesColl);
      const activeBusesQuery = query(busesColl, where('status', '==', 'enroute'));
      const activeBusesSnap = await getCountFromServer(activeBusesQuery);

      // 3. Applications
      const applicationsColl = collection(db, 'applications');
      const pendingAppsQuery = query(applicationsColl, where('state', '==', 'submitted'));
      const verificationQuery = query(applicationsColl, where('state', '==', 'awaiting_verification'));

      const [pendingAppsSnap, verificationSnap] = await Promise.all([
        getCountFromServer(pendingAppsQuery),
        getCountFromServer(verificationQuery)
      ]);

      // 4. Renewal Requests (Pending Verification)
      const renewalColl = collection(db, 'renewal_requests');
      const renewalQuery = query(renewalColl, where('status', '==', 'pending'));
      const renewalRequestsSnap = await getCountFromServer(renewalQuery);

      // 5. Total Revenue & Payment Trend
      let totalRevenue = 0;
      let trend: any[] = [];
      try {
        if (currentUser) {
          const token = await currentUser.getIdToken();
          const response = await fetch(`/api/payment/analytics?mode=${trendMode}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await response.json();
          if (data.success && data.data) {
            totalRevenue = data.data.totalRevenue;
            trend = data.data.trend || [];
            setPaymentTrend(trend);
          }
        }
      } catch (e) {
        console.error("Revenue fetch error", e);
      }

      // 6. Fetch ALL Buses and Routes for Charts (Simulate full fetch for analytics)
      const allBusesSnap = await getDocs(collection(db, 'buses'));
      const allBusesData = allBusesSnap.docs.map(d => ({ ...d.data(), id: d.id, busId: d.id }));
      setAllBuses(allBusesData);

      const allRoutesSnap = await getDocs(collection(db, 'routes'));
      const allRoutesData = allRoutesSnap.docs.map(d => ({ ...d.data(), id: d.id, routeId: d.id }));
      setAllRoutes(allRoutesData);

      setRealCounts({
        totalStudents: totalStudentsSnap.data().count,
        activeStudents: activeCount,
        totalDrivers: totalDriversSnap.data().count,
        totalBuses: totalBusesSnap.data().count,
        activeBuses: activeBusesSnap.data().count,
        morningStudents: morningCount,
        eveningStudents: eveningCount,
        pendingApplications: pendingAppsSnap.data().count,
        pendingVerifications: verificationSnap.data().count,
        renewalRequests: renewalRequestsSnap.data().count,
        totalRevenue: totalRevenue // using calculated revenue
      });

    } catch (error) {
      console.error("Error fetching real counts:", error);
    }
  };

  useEffect(() => {
    fetchRealTotalCounts();
  }, [trendMode]);

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
    totalDrivers: 0,
    activeDrivers: 0,
    totalBuses: 0,
    activeBuses: 0,
    totalRoutes: 0,
    totalNotifications: 0,
    unreadNotifications: 0,
    pendingVerifications: 0,
    pendingApplications: 0,
    approvedToday: 0,
    rejectedToday: 0,
    morningStudents: 0,
    eveningStudents: 0,
    totalRevenue: 0
  });

  // Manual refresh handler
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
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
    setIsRefreshing(false);
  };

  const [busUtilization, setBusUtilization] = useState<any[]>([]);
  const [studentDistribution, setStudentDistribution] = useState<any[]>([]);
  const [applicationTrend, setApplicationTrend] = useState<any[]>([]);
  const [routeOccupancy, setRouteOccupancy] = useState<any[]>([]);
  const [verificationTrend, setVerificationTrend] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading) {
      if (!currentUser || !userData || userData.role !== 'admin') {
        router.push('/login');
        return;
      }
    }
  }, [authLoading, currentUser, userData, router]);


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
      totalDrivers: realCounts.totalDrivers,
      activeDrivers: drivers.filter((d: any) => d.assignedBusId || d.busId).length,
      totalBuses: realCounts.totalBuses,
      activeBuses: realCounts.activeBuses,
      totalRoutes: routes.length,
      totalNotifications: notifications.length,
      unreadNotifications: unreadNotifs.length,
      pendingVerifications: realCounts.renewalRequests, // Showing Renewal Requests as "Pending Verification" as requested
      pendingApplications: realCounts.pendingApplications,
      approvedToday: approvedToday.length,
      rejectedToday: rejectedToday.length,
      morningStudents: realCounts.morningStudents,
      eveningStudents: realCounts.eveningStudents,
      totalRevenue: realCounts.totalRevenue
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
    const activeTripData = buses.filter((b: any) => b.status === 'enroute').slice(0, 5).map((bus: any) => ({
      id: bus.id,
      busId: bus.busNumber,
      routeName: routes.find((r: any) => r.routeId === bus.routeId)?.routeName || 'Unknown',
      driverName: bus.driverName || drivers.find((d: any) => d.id === bus.driverId)?.name || 'Unknown',
      driverId: drivers.find((d: any) => d.id === bus.driverId)?.driverId || drivers.find((d: any) => d.id === bus.driverId)?.employeeId || 'N/A',
      startTime: new Date().toISOString(),
      studentCount: students.filter((s: any) => s.routeId === bus.routeId).length,
      status: 'On trip'
    }));
    setActiveTrips(activeTripData);
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


  if (allDataLoading) {
    return <FullScreenLoader message="Loading Dashboard..." />;
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
    <div className="flex-1 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-[#05060e] dark:via-[#0a0d1f] dark:to-[#05060e] min-h-screen relative overflow-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/14 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/14 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      <div className="px-6 md:px-12 pt-20 md:pt-20 pb-20 md:pb-20 space-y-3 relative z-10 max-w-7xl mx-auto">
        {/* Header - Ultra Compact */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-600 to-cyan-600 bg-clip-text text-transparent animate-pulse">
                  Welcome back, {getFirstName()}!
                </h1>
                <div className="text-[12px] text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block ml-1.5"></span>
                  Analytics Console • Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
          <Button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="group h-8 px-4 bg-white hover:bg-gray-50 text-gray-600 hover:text-purple-600 border border-gray-200 hover:border-purple-200 shadow-sm hover:shadow-lg hover:shadow-purple-500/10 font-bold text-[10px] uppercase tracking-widest rounded-lg transition-all duration-300 active:scale-95"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 transition-transform duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
            Refresh Data
          </Button>
        </div>

        {/* KPI Cards - Ultra Compact */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Card
            className="cursor-pointer hover:scale-[1.02] transition-all duration-300 bg-gradient-to-br from-fuchsia-500/15 to-pink-500/20 border-fuchsia-500/30 dark:border-fuchsia-500/40 backdrop-blur-md shadow-sm group"
            onClick={() => handleKpiClick('/admin/sys-renewal-config-x9k2p')}
          >
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-fuchsia-400 transition-colors !pb-0 !mb-0">System Bus Fee</CardTitle>
                <Shield className="h-3 w-3 text-fuchsia-400 group-hover:scale-110 group-hover:animate-pulse transition-transform" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-fuchsia-400 transition-colors">₹{systemConfig?.busFee?.amount || '...'}</div>
              <p className="text-[8px] text-gray-500 mt-0.5">Fixed Rate</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:scale-[1.02] transition-all duration-300 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/20 dark:to-indigo-500/20 border-blue-200 dark:border-blue-500/30 backdrop-blur-sm shadow-sm group"
            onClick={() => handleKpiClick('/admin/students')}
          >
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-gray-400 group-hover:text-blue-400 transition-colors !pb-0 !mb-0">Total Students</CardTitle>
                <Users className="h-3 w-3 text-blue-500 group-hover:scale-110 transition-transform" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{stats.totalStudents}</div>
              <p className="text-[8px] text-gray-500 mt-0.5">Enrolled users</p>
            </CardContent>
          </Card>

          <Card className="hover:scale-[1.02] transition-all duration-300 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/20 border-emerald-200 dark:border-emerald-500/25 backdrop-blur-sm shadow-sm group cursor-pointer">
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-gray-400 group-hover:text-green-400 transition-colors !pb-0 !mb-0">Active Students</CardTitle>
                <Activity className="h-3 w-3 text-green-500 group-hover:scale-110 transition-transform" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{stats.activeStudents}</div>
              <p className="text-[8px] text-gray-500 mt-0.5">Service active</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:scale-[1.02] transition-all duration-300 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-500/15 dark:to-amber-500/20 border-orange-200 dark:border-orange-500/25 backdrop-blur-sm shadow-sm group"
            onClick={() => handleKpiClick('/admin/drivers')}
          >
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-gray-400 group-hover:text-orange-400 transition-colors !pb-0 !mb-0">Active Drivers</CardTitle>
                <UserCheck className="h-3 w-3 text-orange-500 group-hover:scale-110 transition-transform" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{stats.activeDrivers}</div>
              <p className="text-[8px] text-gray-500 mt-0.5">On duty today</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:scale-[1.02] transition-all duration-300 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/15 dark:to-pink-500/20 border-purple-200 dark:border-purple-500/25 backdrop-blur-sm shadow-sm group"
            onClick={() => handleKpiClick('/admin/applications')}
          >
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-gray-400 group-hover:text-purple-400 transition-colors !pb-0 !mb-0">Pending Applications</CardTitle>
                <FileText className="h-3 w-3 text-purple-500 group-hover:scale-110 transition-transform" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{stats.pendingApplications}</div>
              <p className="text-[8px] text-gray-500 mt-0.5">Needs review</p>
            </CardContent>
          </Card>

          <Card className="hover:scale-[1.02] transition-all duration-300 bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-500/20 dark:to-sky-500/20 border-cyan-200 dark:border-cyan-500/30 backdrop-blur-sm shadow-sm group cursor-pointer overflow-hidden">
            <CardHeader className="px-2.5 pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-cyan-400 transition-colors uppercase tracking-wider !pb-0 !mb-0">Shift Distribution</CardTitle>
                <PieChartIcon className="h-3 w-3 text-cyan-500 group-hover:rotate-12 transition-transform" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-slate-700/50 rounded-lg px-2.5 h-7 hover:bg-orange-500/5 transition-colors group/m shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)] group-hover/m:scale-125 transition-transform" />
                  <span className="text-[9px] text-gray-500 dark:text-gray-300 font-bold uppercase tracking-wider">Morning</span>
                </div>
                <span className="text-xs font-bold text-gray-900 dark:text-white transition-colors group-hover/m:text-orange-400">{stats.morningStudents}</span>
              </div>

              <div className="flex items-center justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-slate-700/50 rounded-lg px-2.5 h-7 hover:bg-blue-500/5 transition-colors group/e shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)] group-hover/e:scale-125 transition-transform" />
                  <span className="text-[9px] text-gray-500 dark:text-gray-300 font-bold uppercase tracking-wider">Evening</span>
                </div>
                <span className="text-xs font-bold text-gray-900 dark:text-white transition-colors group-hover/e:text-blue-400">{stats.eveningStudents}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* High-Load Bus Alerts */}
        <HighLoadAlert role="admin" className="animate-fade-in" />

        {/* Instant Analytics Overview - Ultra Compact */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Payment Analytics */}
          <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-500/30 transition-all duration-300 group cursor-pointer">
            <CardHeader className="px-2.5">
              <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-emerald-400 transition-colors">
                <CreditCard className="h-3 w-3 group-hover:scale-110 transition-transform" />
                Payment Analytics
              </CardTitle>
              <CardDescription className="text-[10px]">Financial Year 2025-2026</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="space-y-0.5">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Total Revenue:</span>
                  <span className="text-emerald-400 font-semibold">₹{stats.totalRevenue || '0'}</span>
                </div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Pending Verification:</span>
                  <span className="text-orange-400 font-semibold">{stats.pendingVerifications}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500 dark:text-gray-400">Collection Rate:</span>
                  <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-[9px] px-1.5 py-0">
                    {stats.totalRevenue > 0 ? '100%' : '0%'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card >

          {/* Enrollment Overview */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-green-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-green-400 transition-colors">
                <Users className="h-3 w-3 group-hover:scale-110 transition-transform" />
                Enrollment Overview
              </CardTitle>
              <CardDescription className="text-[10px]">Current capacity status</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="space-y-0.5">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Total Capacity:</span>
                  <span className="text-gray-900 dark:text-white font-semibold">{buses.reduce((acc, b: any) => {
                    const capacity = typeof b.capacity === 'string' && b.capacity.includes('/')
                      ? parseInt(b.capacity.split('/')[1])
                      : b.totalCapacity || 50;
                    return acc + capacity;
                  }, 0)} seats</span>
                </div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Students Enrolled:</span>
                  <span className="text-green-400 font-semibold">{stats.totalStudents}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500 dark:text-gray-400">Occupancy Rate:</span>
                  <span className="text-cyan-400 font-semibold">
                    {buses.reduce((acc, b: any) => {
                      const capacity = typeof b.capacity === 'string' && b.capacity.includes('/')
                        ? parseInt(b.capacity.split('/')[1])
                        : b.totalCapacity || 50;
                      return acc + capacity;
                    }, 0) > 0
                      ? Math.round((students.filter((s: any) => s.status === 'active').length / buses.reduce((acc, b: any) => {
                        const capacity = typeof b.capacity === 'string' && b.capacity.includes('/')
                          ? parseInt(b.capacity.split('/')[1])
                          : b.totalCapacity || 50;
                        return acc + capacity;
                      }, 0)) * 100)
                      : 0}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card >

          {/* Processing Efficiency - Replaces Priority Tasks */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-violet-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-violet-400 transition-colors">
                <Activity className="h-3 w-3 group-hover:scale-110 transition-transform" />
                Academic Year Info
              </CardTitle>
              <CardDescription className="text-[10px]">Key academic dates</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Academic Year End:</span>
                  <span className="text-green-400 font-bold">{systemConfig?.academicYearEnd ? (() => {
                    const d = new Date(systemConfig.academicYearEnd!);
                    const day = d.getDate();
                    const suffix = (day > 3 && day < 21) || day % 10 > 3 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10];
                    return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'long' })}`;
                  })() : 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Soft Block:</span>
                  <span className="text-yellow-400 font-bold">{systemConfig?.softBlock ? (() => {
                    const d = new Date(systemConfig.softBlock!);
                    const day = d.getDate();
                    const suffix = (day > 3 && day < 21) || day % 10 > 3 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10];
                    return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'long' })}`;
                  })() : 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-500 dark:text-gray-400">Hard Block:</span>
                  <span className="text-red-400 font-bold">{systemConfig?.hardBlock ? (() => {
                    const d = new Date(systemConfig.hardBlock!);
                    const day = d.getDate();
                    const suffix = (day > 3 && day < 21) || day % 10 > 3 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10];
                    return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'long' })}`;
                  })() : 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card >
        </div >

        {/* Active Trips & Transactional Analytics - Equal Width */}
        < div className="grid grid-cols-1 lg:grid-cols-2 gap-2" >
          {/* Active Trips */}
          < ActiveTripsCard trips={activeTrips} />

          {/* Transactional Analytics - Replaces Quick Actions */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-indigo-400 transition-colors">
                  <Wallet className="h-3 w-3 group-hover:scale-110 transition-transform" />
                  Transactional Analytics
                </CardTitle>
                {/* Toggle Button: Days / Months */}
                <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
                  <button
                    onClick={(e) => { e.stopPropagation(); setTrendMode('days'); }}
                    className={`px-2 py-0.5 rounded-md text-[9px] font-semibold transition-all duration-200 ${trendMode === 'days'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                  >
                    DAYS
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTrendMode('months'); }}
                    className={`px-2 py-0.5 rounded-md text-[9px] font-semibold transition-all duration-200 ${trendMode === 'months'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                  >
                    MONTHS
                  </button>
                </div>
              </div>
              <CardDescription className="text-[10px] opacity-0">Hidden</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5 h-[160px] flex flex-col justify-center" style={{ minWidth: 0 }}>
              {/* Visual Representation */}
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={paymentTrend}>
                  <defs>
                    <linearGradient id="colorTrans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px', fontSize: '10px' }}
                    labelStyle={{ color: '#9ca3af', marginBottom: '4px' }}
                    formatter={(value: any) => [`₹${value}`, 'Amount']}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Payments"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTrans)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card >
        </div >

        {/* Analytics Grid - Ultra Compact */}
        < div className="grid grid-cols-1 md:grid-cols-2 gap-2" >
          {/* Bus Utilization - Premium Enhanced */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-cyan-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="p-1 rounded-lg bg-cyan-500/20 border border-cyan-500/30 group-hover:bg-cyan-500/30 transition-colors">
                    <Bus className="h-3 w-3 text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xs text-gray-900 dark:text-white group-hover:text-cyan-400 transition-colors">
                      Bus Utilization
                    </CardTitle>
                    <CardDescription className="text-[9px]">Real-time capacity tracking</CardDescription>
                  </div>
                </div>
                <Badge className="bg-cyan-600/20 text-cyan-400 border-cyan-600/30 text-[9px] px-1.5 py-0">
                  {busUtilization.length} buses
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-2.5">
              {busUtilization.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-hide">
                  {busUtilization.map((bus, i) => {
                    const utilizationLevel = bus.utilization >= 90 ? 'critical' : bus.utilization >= 70 ? 'high' : bus.utilization >= 50 ? 'medium' : 'low';
                    const gradientClass = utilizationLevel === 'critical'
                      ? 'from-red-600 via-red-500 to-red-600'
                      : utilizationLevel === 'high'
                        ? 'from-orange-600 via-orange-500 to-orange-600'
                        : utilizationLevel === 'medium'
                          ? 'from-yellow-600 via-yellow-500 to-yellow-600'
                          : 'from-green-600 via-green-500 to-green-600';
                    const bgClass = utilizationLevel === 'critical'
                      ? 'bg-red-950/30 border-red-800/40'
                      : utilizationLevel === 'high'
                        ? 'bg-orange-950/30 border-orange-800/40'
                        : utilizationLevel === 'medium'
                          ? 'bg-yellow-950/30 border-yellow-800/40'
                          : 'bg-green-950/30 border-green-800/40';

                    return (
                      <div key={i} className={`p-1.5 rounded-lg border ${bgClass} hover:bg-opacity-50 transition-colors duration-200`}>
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-1">
                            <Bus className="h-2.5 w-2.5 text-cyan-400" />
                            <span className="text-[10px] font-medium text-gray-900 dark:text-white">{bus.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium hidden sm:inline-block">
                              <span className="text-gray-500">Morning:</span> <span className="text-orange-400">{bus.morningCount}</span> <span className="text-gray-600 mx-0.5">|</span> <span className="text-gray-500">Evening:</span> <span className="text-blue-400">{bus.eveningCount}</span>
                            </span>
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium sm:hidden">
                              M: <span className="text-orange-400">{bus.morningCount}</span> E: <span className="text-blue-400">{bus.eveningCount}</span>
                            </span>
                            <Badge className={`text-[8px] px-1 py-0 ${utilizationLevel === 'critical' ? 'bg-red-600' :
                              utilizationLevel === 'high' ? 'bg-orange-600' :
                                utilizationLevel === 'medium' ? 'bg-yellow-600' : 'bg-green-600'
                              }`}>
                              {bus.utilization}%
                            </Badge>
                          </div>
                        </div>
                        <div className="relative w-full bg-gray-800/50 rounded-full h-1.5 overflow-hidden border border-gray-700/30">
                          <div
                            className={`bg-gradient-to-r ${gradientClass} h-1.5 rounded-full transition-all duration-500 ${utilizationLevel === 'critical' ? 'animate-pulse' : ''
                              }`}
                            style={{ width: `${Math.min(bus.utilization, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
                  <Bus className="h-8 w-8 mb-2 opacity-50" />
                  <h3 className="text-xs font-semibold mb-1">No Bus Data</h3>
                  <p className="text-[10px] text-center">Bus utilization data will appear once buses are assigned to routes</p>
                </div>
              )}
            </CardContent>
          </Card >

          {/* Route Occupancy */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-pink-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-pink-400 transition-colors">
                <RouteIcon className="h-3 w-3 group-hover:scale-110 transition-transform text-gray-500 dark:text-gray-400 group-hover:text-pink-500" />
                Route Occupancy
              </CardTitle>
              <CardDescription className="text-[10px]">Top 8 routes by occupancy rate</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5" style={{ minWidth: 0 }}>
              {routeOccupancy.length > 0 && routeOccupancy.some(r => r.students > 0) ? (
                <div className="h-[140px] w-full">
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={routeOccupancy}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 9 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', fontSize: '10px' }} />
                      <Bar dataKey="occupancy" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
                  <RouteIcon className="h-8 w-8 mb-2 opacity-50" />
                  <h3 className="text-xs font-semibold mb-1">No Route Data</h3>
                  <p className="text-[10px] text-center">Route occupancy data will appear once students are assigned to routes</p>
                </div>
              )}
            </CardContent>
          </Card >

          {/* Student Distribution */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-yellow-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-yellow-400 transition-colors">
                <PieChartIcon className="h-3 w-3 group-hover:scale-110 transition-transform text-gray-500 dark:text-gray-400 group-hover:text-yellow-500" />
                Student Distribution by Shift
              </CardTitle>
              <CardDescription className="text-[10px]">Morning vs Evening</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5" style={{ minWidth: 0 }}>
              {studentDistribution.some(s => s.value > 0) ? (
                <div className="h-[120px] w-full">
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie
                        data={studentDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={45}
                        paddingAngle={5}
                        minAngle={15}
                        dataKey="value"
                      >
                        {studentDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px', fontSize: '10px' }}
                        itemStyle={{ color: '#e5e7eb' }}
                        formatter={(value: any, name: any, props: any) => {
                          const total = studentDistribution.reduce((a, b) => a + b.value, 0);
                          const val = value as number;
                          const percent = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                          return [`${val} (${percent}%)`, name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '9px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
                  <PieChartIcon className="h-8 w-8 mb-2 opacity-50" />
                  <h3 className="text-xs font-semibold mb-1">No Student Data</h3>
                  <p className="text-[10px] text-center">Student distribution data will appear once students are enrolled</p>
                </div>
              )}
            </CardContent>
          </Card >

          {/* Driver Assignment Overview with Bar Chart */}
          < Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-cyan-500/30 transition-all duration-300 group cursor-pointer" >
            <CardHeader className="px-2.5">
              <CardTitle className="text-xs text-gray-900 dark:text-white flex items-center gap-1 group-hover:text-cyan-400 transition-colors">
                <User className="h-3 w-3 group-hover:scale-110 transition-transform" />
                Driver Assignment Overview
              </CardTitle>
              <CardDescription className="text-[10px]">Driver allocation and availability status</CardDescription>
            </CardHeader>
            <CardContent className="px-2.5">
              {drivers.length > 0 ? (
                <div className="space-y-2">
                  {/* Visual Bar Representation */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Active Assigned Drivers */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-green-400 font-medium">Active & Assigned</span>
                        <span className="text-xs font-bold text-green-400">
                          {drivers.filter((d: any) => d.status === 'active' && d.busId && d.busId !== '').length}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${drivers.length > 0 ? (drivers.filter((d: any) => d.status === 'active' && d.busId && d.busId !== '').length / drivers.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    {/* Unassigned Drivers */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-orange-400 font-medium">Unassigned</span>
                        <span className="text-xs font-bold text-orange-400">
                          {drivers.filter((d: any) => !d.busId || d.busId === '').length}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${drivers.length > 0 ? (drivers.filter((d: any) => !d.busId || d.busId === '').length / drivers.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    {/* Inactive Drivers */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-red-400 font-medium">Inactive</span>
                        <span className="text-xs font-bold text-red-400">
                          {drivers.filter((d: any) => d.status !== 'active').length}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-red-500 to-rose-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${drivers.length > 0 ? (drivers.filter((d: any) => d.status !== 'active').length / drivers.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    {/* On Duty */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-blue-400 font-medium">On Duty (En-route)</span>
                        <span className="text-xs font-bold text-blue-400">
                          {drivers.filter((d: any) => {
                            const assignedBus = buses.find((b: any) => b.driverId === d.id || b.driverId === d.driverId);
                            return assignedBus && (assignedBus.status === 'enroute' || assignedBus.currentStatus === 'enroute');
                          }).length}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all animate-pulse"
                          style={{
                            width: `${drivers.length > 0 ? (drivers.filter((d: any) => {
                              const assignedBus = buses.find((b: any) => b.driverId === d.id || b.driverId === d.driverId);
                              return assignedBus && (assignedBus.status === 'enroute' || assignedBus.currentStatus === 'enroute');
                            }).length / drivers.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="pt-2 border-t border-gray-800 grid grid-cols-3 gap-2">
                    <div className="text-center p-1.5 bg-gray-800/50 rounded">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{drivers.length}</p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400">Total Drivers</p>
                    </div>
                    <div className="text-center p-1.5 bg-gray-800/50 rounded">
                      <p className="text-xs font-bold text-cyan-400">
                        {drivers.length > 0 ? Math.round((students.length / drivers.length) * 10) / 10 : 0}
                      </p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400">Avg Students/Driver</p>
                    </div>
                    <div className="text-center p-1.5 bg-gray-800/50 rounded">
                      <p className="text-xs font-bold text-emerald-400">
                        {drivers.length > 0 ? Math.round((drivers.filter((d: any) => d.status === 'active' && d.busId && d.busId !== '').length / drivers.length) * 100) : 0}%
                      </p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400">Assignment Rate</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
                  <User className="h-8 w-8 mb-2 opacity-50" />
                  <h3 className="text-xs font-semibold mb-1">No Driver Data</h3>
                  <p className="text-[10px] text-center">Driver assignment data will appear once drivers are added</p>
                </div>
              )}
            </CardContent>
          </Card >

        </div >



      </div >
    </div >
  );
}
