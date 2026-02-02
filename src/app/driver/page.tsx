"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bus, MapPin, Users, Clock, Navigation, QrCode,
  ArrowRight, PlayCircle, StopCircle, Activity,
  MapPinned, Zap, CreditCard, Info, TrendingUp,
  Calendar, Bell, Shield, Fuel, AlertTriangle,
  CheckCircle, XCircle, Loader2, Sparkles, Star,
  Crown, Award, Target, BarChart3, Hash, User, Monitor
} from "lucide-react";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import "@/styles/animations.css";
import { PremiumPageLoader } from "@/components/LoadingSpinner";
import { supabase } from "@/lib/supabase-client";

export default function DriverDashboard() {
  const { userData, currentUser } = useAuth();
  const router = useRouter();
  // Initialize trip state based on local storage or default to false, will sync with DB
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [driverDataFirestore, setDriverDataFirestore] = useState<any>(null);
  const [driverDataLoading, setDriverDataLoading] = useState(true);
  const [assignedBusData, setAssignedBusData] = useState<any>(null);
  const [assignedRouteData, setAssignedRouteData] = useState<any>(null);
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [busesLoading, setBusesLoading] = useState(true);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // NOTE: Cache clearing removed for production - caching is now enabled

  // Check for expired swaps on mount
  useEffect(() => {
    if (!currentUser?.uid) return;

    const checkExpiredSwaps = async () => {
      try {
        console.log('🔍 Checking for expired swap requests...');
        const response = await fetch('/api/driver-swap/check-expired', {
          method: 'POST'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.expired > 0) {
            console.log(`✅ Expired ${data.expired} swap(s) - data will refresh automatically`);
            // Real-time listeners will automatically pick up the changes
          }
        }
      } catch (error) {
        console.error('Error checking expired swaps:', error);
        // Non-critical error, don't block UI
      }
    };

    // Check immediately on mount
    checkExpiredSwaps();

    // Set up interval to check every 5 minutes
    const interval = setInterval(checkExpiredSwaps, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  // Real-time listener for driver data
  useEffect(() => {
    if (!currentUser?.uid) return;

    console.log('🔄 Setting up driver real-time listener for UID:', currentUser.uid);

    const driverUnsubscribe = onSnapshot(
      doc(db, 'drivers', currentUser.uid),
      (doc) => {
        if (doc.exists()) {
          const driverData = { id: doc.id, ...doc.data() };
          console.log('👤 Real-time driver update:', driverData);
          setDriverDataFirestore(driverData);
        } else {
          console.log('❌ Driver document not found for UID:', currentUser.uid);
          setDriverDataFirestore(null);
        }
        setDriverDataLoading(false);
      },
      (error) => {
        console.error('❌ Error listening to driver data:', error);
        setDriverDataLoading(false);
      }
    );

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up driver listener');
      driverUnsubscribe();
    };
  }, [currentUser?.uid]);

  // Real-time listener for driver's assigned bus and route
  useEffect(() => {
    // Clear bus/route data if driver has no assignments (reserved driver) or user is not authenticated
    if (!currentUser || !driverDataFirestore?.assignedBusId || !driverDataFirestore?.assignedRouteId) {
      console.log('🔄 Driver has no bus/route assignment or not authenticated - clearing data');
      setAssignedBusData(null);
      setAssignedRouteData(null);
      return;
    }

    console.log('🔄 Setting up specific bus and route listeners...');

    // Listen to specific assigned bus
    const busUnsubscribe = onSnapshot(
      doc(db, 'buses', driverDataFirestore.assignedBusId),
      (doc) => {
        if (doc.exists()) {
          const busData = { id: doc.id, ...doc.data() };
          console.log('🚌 Real-time assigned bus update:', busData);
          setAssignedBusData(busData);
        } else {
          console.log('❌ Assigned bus document not found');
          setAssignedBusData(null);
        }
      },
      (error) => {
        // Don't log permission errors when user is not authenticated
        if (currentUser && !error.message.includes('Missing or insufficient permissions')) {
          console.error('❌ Error listening to assigned bus:', error);
        }
      }
    );

    // Listen to specific assigned route
    const routeUnsubscribe = onSnapshot(
      doc(db, 'routes', driverDataFirestore.assignedRouteId),
      (doc) => {
        if (doc.exists()) {
          const routeData = { id: doc.id, ...doc.data() };
          console.log('🗺️ Real-time assigned route update:', routeData);
          setAssignedRouteData(routeData);
        } else {
          console.log('❌ Assigned route document not found');
          setAssignedRouteData(null);
        }
      },
      (error) => {
        // Don't log permission errors when user is not authenticated
        if (currentUser && !error.message.includes('Missing or insufficient permissions')) {
          console.error('❌ Error listening to assigned route:', error);
        }
      }
    );

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up specific bus and route listeners');
      busUnsubscribe();
      routeUnsubscribe();
    };
  }, [driverDataFirestore?.assignedBusId, driverDataFirestore?.assignedRouteId, currentUser]);

  // One-time fetch for buses, routes, and students (tie to auth state)
  // SPARK PLAN SAFETY: Replaced onSnapshot with getDocs to prevent quota exhaustion
  useEffect(() => {
    // Skip setting up listeners when signed out; also clear local state
    if (!currentUser) {
      setBuses([]);
      setRoutes([]);
      setStudents([]);
      setBusesLoading(false);
      setRoutesLoading(false);
      setStudentsLoading(false);
      return;
    }

    const fetchAllData = async () => {
      console.log('📦 Fetching buses, routes, and students (one-time)...');

      try {
        // Import getDocs dynamically to avoid issues
        const { getDocs } = await import('firebase/firestore');

        // Fetch all three collections in parallel
        const [busesSnapshot, routesSnapshot, studentsSnapshot] = await Promise.all([
          getDocs(collection(db, 'buses')),
          getDocs(collection(db, 'routes')),
          getDocs(collection(db, 'students')),
        ]);

        const busesData = busesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('🚌 Loaded buses:', busesData.length);
        setBuses(busesData);
        setBusesLoading(false);

        const routesData = routesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('🗺️ Loaded routes:', routesData.length);
        setRoutes(routesData);
        setRoutesLoading(false);

        const studentsData = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('👥 Loaded students:', studentsData.length);
        setStudents(studentsData);
        setStudentsLoading(false);
      } catch (error: any) {
        console.error('❌ Error fetching data:', error);
        setBusesLoading(false);
        setRoutesLoading(false);
        setStudentsLoading(false);
      }
    };

    fetchAllData();
  }, [currentUser]);

  // Use Firestore data
  const driverData = driverDataFirestore;

  const busData = useMemo(() => {
    // First try to use directly fetched assigned bus data
    if (assignedBusData) {
      console.log('🚌 Using directly fetched assigned bus data:', assignedBusData);
      return assignedBusData;
    }

    if (!driverData || !buses.length) {
      console.log('❌ Missing data - driverData:', !!driverData, 'buses:', buses.length);
      return null;
    }

    console.log('🔍 Driver data:', driverData);
    console.log('🚌 Available buses:', buses.length);
    console.log('🔍 Driver UID:', currentUser?.uid);
    console.log('🚌 Sample bus structure:', buses.slice(0, 2).map(b => ({
      id: b.id,
      busId: b.busId,
      busNumber: b.busNumber,
      assignedDriverId: b.assignedDriverId,
      activeDriverId: b.activeDriverId,
      driverUid: b.driverUid,
      driver_uid: b.driver_uid
    })));

    // First check if driver is activeDriverId on any bus (temporary swap)
    const activeBus = buses.find(b => b.activeDriverId === currentUser?.uid);
    if (activeBus) {
      console.log('🚌 Found bus where driver is activeDriverId:', activeBus);
      return { ...activeBus, isTemporaryAssignment: true };
    }

    // Then check assignedDriverId (permanent assignment)
    console.log('🔍 Checking for assignedDriverId matches...');
    const assignedBus = buses.find(b => {
      const matches = b.assignedDriverId === currentUser?.uid ||
        b.driverUid === currentUser?.uid ||
        b.driver_uid === currentUser?.uid;
      if (matches) {
        console.log('🚌 Found matching bus:', {
          busId: b.id || b.busId,
          assignedDriverId: b.assignedDriverId,
          driverUid: b.driverUid,
          driver_uid: b.driver_uid,
          activeDriverId: b.activeDriverId
        });
      }
      return matches;
    });
    if (assignedBus && !assignedBus.activeDriverId) {
      // Only return if no other driver is currently active
      console.log('🚌 Found bus where driver is assignedDriverId:', assignedBus);
      // Only return if no other driver is currently active
      console.log('🚌 Found bus where driver is assignedDriverId:', assignedBus);
      return { ...assignedBus, isTemporaryAssignment: false };
    }

    // Legacy check with bus ID from driver data
    let busId = driverData.assignedBusId || driverData.busId || driverData.busDetails ||
      (Array.isArray(driverData.assignedBusIds) ? driverData.assignedBusIds[0] : driverData.assignedBusIds) ||
      (Array.isArray(driverData.busId) ? driverData.busId[0] : driverData.busId);

    console.log('🔍 Looking for bus with ID:', busId);

    // Clean up the bus ID if it has special formatting
    if (busId) {
      if (busId.includes('(')) {
        busId = busId.split('(')[0].trim();
      }
      if (busId.startsWith('route_')) {
        busId = busId.replace('route_', 'bus_');
      }
    }

    if (busId) {
      const bus = buses.find(b =>
        b.busId === busId ||
        b.id === busId ||
        b.busNumber === busId
      );
      if (bus) {
        // Check if this driver is still the active driver
        const effectiveDriver = bus.activeDriverId || bus.assignedDriverId || bus.driverUid;
        if (effectiveDriver === currentUser?.uid) {
          console.log('🚌 Found bus data:', bus);
          console.log('🚌 Found bus data:', bus);
          return bus;
        }
      }
    }
    console.log('❌ No bus data found or driver not active');
    return null;
  }, [driverData, buses, currentUser, assignedBusData]);

  // Sync hasActiveTrip with API and Realtime (Same as Student Dashboard)
  useEffect(() => {
    // Get distinct bus ID
    const busId = busData?.id || busData?.busId;
    if (!busId) {
      console.log('❌ No bus ID available for trip status check');
      return;
    }

    console.log('🔄 Setting up robust trip status matching Student Dashboard for bus:', busId);

    // 1. Initial Check using API (Bypassing RLS)
    const checkActiveTrip = async () => {
      try {
        console.log('🔍 Checking trip status via API for bus:', busId);
        // Use the student API as it's a generic "is this bus active?" check that bypasses RLS
        const response = await fetch(`/api/student/trip-status?busId=${encodeURIComponent(busId)}`);

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Trip status API result:', result);
          setHasActiveTrip(!!result.tripActive);
        } else {
          console.warn('⚠️ Trip status API failed');
        }
      } catch (err) {
        console.error('❌ Error hitting trip status API:', err);
      }
    };

    checkActiveTrip();

    // 2. Real-time Database Changes (driver_status)
    const channel = supabase
      .channel(`driver_dashboard_status_db_${busId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_status',
          filter: `bus_id=eq.${busId}`
        },
        (payload) => {
          console.log('📡 Real-time driver_status update:', payload);
          if (payload.eventType === 'DELETE') {
            setHasActiveTrip(false);
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newStatus = (payload.new as any).status;
            const isActive = newStatus === 'on_trip' || newStatus === 'enroute';
            setHasActiveTrip(isActive);
          }
        }
      )
      .subscribe();

    // 3. BroadCast Events (Immediate updates from driver actions)
    const tripChannel = supabase
      .channel(`trip-status-${busId}`)
      .on('broadcast', { event: 'trip_started' }, (payload) => {
        console.log('🚀 Trip started broadcast received!', payload);
        setHasActiveTrip(true);
      })
      .on('broadcast', { event: 'trip_ended' }, (payload) => {
        console.log('🏁 Trip ended broadcast received!', payload);
        setHasActiveTrip(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(tripChannel);
    };
  }, [busData?.id, busData?.busId]);

  const routeData = useMemo(() => {
    // First try to use directly fetched assigned route data
    if (assignedRouteData) {
      console.log('🗺️ Using directly fetched assigned route data:', assignedRouteData);
      return assignedRouteData;
    }

    console.log('🔍 Route data calculation - busData:', busData);
    console.log('🔍 Route data calculation - driverData:', driverData);
    console.log('🔍 Available routes:', routes.length);

    // First priority: Check if bus has embedded route data
    if (busData?.route) {
      console.log('📍 Using embedded route data from bus:', busData.route);
      return busData.route;
    }

    // Second priority: Check if bus has routeId and find in routes collection
    if (busData?.routeId && routes.length) {
      console.log('🔍 Looking for route with ID:', busData.routeId);
      const route = routes.find(r =>
        r.routeId === busData.routeId ||
        r.id === busData.routeId ||
        r.routeName === busData.routeId
      );
      if (route) {
        console.log('📍 Using route data from routes collection:', route);
        return route;
      }
    }

    // Third priority: Try driver's assigned route
    if (!driverData || !routes.length) return null;

    let routeId = driverData.assignedRouteId || driverData.routeId || driverData.routed ||
      (Array.isArray(driverData.assignedRouteIds) ? driverData.assignedRouteIds[0] : driverData.assignedRouteIds) ||
      (Array.isArray(driverData.routeId) ? driverData.routeId[0] : driverData.routeId);

    console.log('🔍 Looking for driver route with ID:', routeId);

    // Clean up the route ID if it has special formatting
    if (routeId) {
      if (routeId.includes('(')) {
        routeId = routeId.split('(')[0].trim();
      }
      if (routeId.startsWith('bus_')) {
        routeId = routeId.replace('bus_', 'route_');
      }
    }

    if (routeId) {
      const route = routes.find(r =>
        r.routeId === routeId ||
        r.id === routeId ||
        r.routeName === routeId
      );
      if (route) {
        console.log('📍 Using route data from driver assignment:', route);
        return route;
      }
    }

    console.log('❌ No route data found');
    return null;
  }, [driverData, routes, busData, assignedRouteData]);

  const studentCount = useMemo(() => {
    if (!busData || !students.length) return 0;
    return students.filter((s: any) => {
      const sBusId = s.busId || s.assignedBusId;
      return sBusId === busData.busId || sBusId === busData.id;
    }).length;
  }, [busData, students]);

  // Calculate bus capacity information
  const busCapacityInfo = useMemo(() => {
    if (!busData) return { current: 0, total: 50, percentage: 0, capacityString: '0%' };

    const current = busData.currentMembers || studentCount;
    const total = busData.totalCapacity || 50;
    const percentage = Math.min((current / total) * 100, 100);
    const capacityString = `${percentage.toFixed(0)}%`;

    return { current, total, percentage, capacityString };
  }, [busData, studentCount]);

  const routeStopCount = useMemo(() => {
    return routeData?.stops?.length || 0;
  }, [routeData]);

  // Calculate route distance information
  const routeDistanceInfo = useMemo(() => {
    if (!busData && !routeData) return { distance: 0, percentage: 0, distanceString: '0km' };

    // Try multiple sources for distance in order of preference
    const rawDistance =
      busData?.routeDistance ||
      busData?.route?.routeDistance ||
      busData?.route?.distance ||
      routeData?.routeDistance ||
      routeData?.distance ||
      routeData?.totalDistance ||
      0;

    const distance = Math.round(rawDistance); // Round off decimal values
    const percentage = Math.min((distance / 100) * 100, 100); // Max 100km for bar
    const distanceString = `${distance}km`;

    return { distance, percentage, distanceString };
  }, [busData, routeData]);

  const loading = driverDataLoading || busesLoading || routesLoading || studentsLoading;

  // Extract key information with better fallbacks
  const driverName = driverData?.fullName || driverData?.name || userData?.name || 'Driver';
  const driverShift = driverData?.shift || busData?.shift || 'Not Set';
  const licenseNumber = driverData?.licenseNumber || 'Not Provided';
  const driverId = driverData?.driverId || driverData?.employeeId || 'Not Set';

  useEffect(() => {
    if (userData && userData.role !== "driver") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#020817]">
        <PremiumPageLoader
          message="Loading Driver Dashboard..."
          subMessage="Preparing your driver interface..."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-950 dark:via-slate-900 dark:to-gray-950 relative overflow-hidden pb-24 md:pb-12">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-8 relative z-10">

        {/* Premium Header with Darker Shade */}
        <div className="relative overflow-hidden rounded-3xl animate-fade-in">
          {/* Reduced blur gradient border */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-90 blur-md animate-pulse" style={{ animationDuration: '4s' }} />

          <div className="relative bg-white/90 dark:bg-gray-900/95 backdrop-blur-lg rounded-3xl p-8 md:p-10 border border-white/30 dark:border-gray-700/50 shadow-2xl">
            {/* Premium shine effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 pointer-events-none" />
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {/* Animated icon with glow */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl blur-xl opacity-60 animate-pulse" />
                    <div className="relative p-4 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-600 to-pink-600 shadow-2xl transform hover:scale-110 transition-all duration-300 hover:rotate-3">
                      <Bus className="h-7 w-7 text-white" />
                      <div className="absolute -top-1 -right-1">
                        <div className="relative">
                          <Star className="h-4 w-4 text-yellow-400 animate-pulse" />
                          <div className="absolute inset-0 bg-yellow-400 blur-sm animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-1">
                      Welcome back, {driverData?.fullName?.split(' ')[0] || 'Driver'}!
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Enhanced Live Status Badges - Compact Row on Mobile */}
                <div className="flex items-center gap-2 md:gap-3 flex-nowrap overflow-x-auto no-scrollbar max-w-full">
                  <div className="relative group flex-shrink-0">
                    <div className={`absolute inset-0 rounded-full blur-md ${hasActiveTrip ? 'bg-green-500/50' : 'bg-gray-400/30'} group-hover:blur-lg transition-all duration-300 bg-transparent`} />
                    <Badge className={`relative px-3 py-1.5 md:px-5 md:py-2.5 text-xs md:text-sm font-semibold border-2 ${hasActiveTrip ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-300 shadow-lg shadow-green-500/30' : 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                      <span className="flex items-center gap-1.5 md:gap-2">
                        <span className={`flex items-center justify-center w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${hasActiveTrip ? 'bg-white animate-pulse' : 'bg-gray-400'}`}>
                          {hasActiveTrip && <span className="absolute w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-white animate-ping" />}
                        </span>
                        {hasActiveTrip ? 'EnRoute' : 'Idle'}
                      </span>
                    </Badge>
                  </div>
                  {driverShift && (
                    <Badge className="flex-shrink-0 px-3 py-1.5 md:px-5 md:py-2.5 text-xs md:text-sm bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-200 dark:border-blue-700 font-semibold shadow-md whitespace-nowrap">
                      <Clock className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                      {driverShift} Shift
                    </Badge>
                  )}
                </div>
              </div>

              {/* Premium Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {hasActiveTrip ? (
                  <Button
                    onClick={() => router.push('/driver/live-tracking')}
                    disabled={false}
                    className="group relative overflow-hidden bg-gradient-to-r from-red-600 via-red-500 to-pink-600 hover:from-red-700 hover:via-red-600 hover:to-pink-700 text-white font-bold shadow-2xl shadow-red-500/40 hover:shadow-red-600/60 transform hover:-translate-y-1 hover:scale-105 transition-all duration-300 px-8 py-3 rounded-xl border-2 border-red-400/50"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                    <span className="absolute inset-0 bg-red-400/30 blur-xl group-hover:blur-2xl transition-all duration-300" />
                    <span className="relative flex items-center justify-center">
                      <StopCircle className="h-5 w-5 mr-2 group-hover:rotate-180 transition-transform duration-500" />
                      End Trip
                      <Sparkles className="h-4 w-4 ml-2 animate-pulse" />
                    </span>
                  </Button>
                ) : (
                  <div className="relative group/btn">
                    <Button
                      onClick={() => router.push('/driver/live-tracking')}
                      disabled={busData?.status === 'Inactive'}
                      className={`group relative overflow-hidden font-bold shadow-2xl transform transition-all duration-300 px-8 py-3 rounded-xl border-2 ${busData?.status === 'Inactive'
                        ? 'bg-gray-600 text-gray-300 border-gray-500 cursor-not-allowed opacity-70'
                        : 'bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-700 hover:via-emerald-600 hover:to-teal-700 text-white border-green-400/50 hover:-translate-y-0.5 hover:scale-102 shadow-green-500/40 hover:shadow-green-600/60'
                        }`}
                    >
                      {busData?.status !== 'Inactive' && (
                        <>
                          <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                          <span className="absolute inset-0 bg-green-400/30 blur-xl group-hover:blur-2xl transition-all duration-300" />
                        </>
                      )}
                      <span className="relative flex items-center justify-center">
                        <PlayCircle className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform duration-300" />
                        Start Trip
                        {busData?.status !== 'Inactive' && <Zap className="h-4 w-4 ml-2 animate-pulse" />}
                        {busData?.status === 'Inactive' && <AlertTriangle className="h-4 w-4 ml-2" />}
                      </span>
                    </Button>
                    {busData?.status === 'Inactive' && (
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 shadow-lg">
                        Bus is currently Inactive
                      </div>
                    )}
                  </div>
                )}
                <Link href="/driver/scan-pass">
                  <Button className="group relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:via-pink-700 hover:to-rose-700 text-white font-bold shadow-2xl shadow-purple-500/40 hover:shadow-purple-600/60 transform hover:-translate-y-0.5 hover:scale-102 transition-all duration-300 px-8 py-3 rounded-xl border-2 border-purple-400/50">
                    <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                    <span className="absolute inset-0 bg-purple-400/30 blur-xl group-hover:blur-2xl transition-all duration-300" />
                    <span className="relative flex items-center justify-center">
                      <QrCode className="h-5 w-5 mr-2 group-hover:rotate-6 transition-transform duration-300" />
                      Scan Pass
                      <Target className="h-4 w-4 ml-2" />
                    </span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Premium Trip Status Alert with Glass Effect */}
        {hasActiveTrip && (
          <div className="relative overflow-hidden rounded-2xl animate-slide-in-up">
            <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-600 opacity-10 blur-2xl" />
            <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 backdrop-blur-xl border-2 border-green-200 dark:border-green-700 rounded-2xl p-5 shadow-lg shadow-green-500/20">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500 rounded-full blur-md opacity-50 animate-pulse" />
                  <div className="relative p-3 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-base font-bold text-green-900 dark:text-green-100">
                      Trip is Active
                    </p>
                    <Badge className="bg-green-600 text-white px-2 py-0.5 text-xs font-bold animate-pulse">
                      LIVE
                    </Badge>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                    Students are tracking your location in real-time
                  </p>
                </div>
                <div className="hidden md:block">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced KPI Stats Grid - 2x2 on Mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 animate-slide-in-up">
          {/* Students Count Card */}
          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-2 border-blue-100 dark:border-blue-900/30">
            {/* Gradient glow on hover */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300" />

            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />

            <CardContent className="relative p-3 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1 sm:mb-2">Total Students</p>
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <p className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                      {studentCount}
                    </p>
                    <TrendingUp className="h-3 w-3 sm:h-5 sm:w-5 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>

                <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg group-hover:scale-105 transition-all duration-300">
                  <Users className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium mb-2 sm:mb-3">Assigned to your bus</p>

              <div className="space-y-2">
                <div className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 w-full">
                    <div className="flex items-center justify-between sm:justify-start gap-2 text-[10px] sm:text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        <span className="text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap">Morning:</span>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white">{busData?.load?.morningCount || 0}</span>
                    </div>
                    <div className="hidden sm:block w-px h-3 bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                    <div className="w-full sm:hidden h-px bg-gray-200 dark:bg-gray-700 my-0.5"></div>
                    <div className="flex items-center justify-between sm:justify-start gap-2 text-[10px] sm:text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                        <span className="text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap">Evening:</span>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white">{busData?.load?.eveningCount || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Route Stops Card */}
          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all duration-300 sm:hover:scale-[1.02] sm:hover:-translate-y-1 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-2 border-purple-100 dark:border-purple-900/30">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-500" />

            <CardContent className="relative p-3 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1 sm:mb-2">Route Stops</p>
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <p className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors duration-300">
                      {routeStopCount}
                    </p>
                    <MapPinned className="h-3 w-3 sm:h-5 sm:w-5 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>

                <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg group-hover:scale-105 transition-all duration-300">
                  <MapPin className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium mb-2 sm:mb-3">Total stops on route</p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Assigned Route</span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold max-w-[60%] truncate text-right">
                    {routeData?.routeName || routeData?.id || busData?.routeId?.replace('route_', 'Route-') || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-purple-100 dark:border-purple-800/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                  <span className="text-[10px] font-medium text-purple-600 dark:text-purple-300 opacity-90 truncate">
                    {routeData?.stops && routeData.stops.length > 0
                      ? `Start: ${typeof routeData.stops[0] === 'string' ? routeData.stops[0] : routeData.stops[0].name || 'Unknown'}`
                      : 'Route details ready'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shift Timing Card */}
          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all duration-300 sm:hover:scale-[1.02] sm:hover:-translate-y-1 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-2 border-orange-100 dark:border-orange-900/30">
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />

            <CardContent className="relative p-3 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1 sm:mb-2">Shift Timing</p>
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <p className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors duration-300">
                      {driverShift === 'Morning & Evening Shift' ? 'M+E' : driverShift?.split(' ')[0] || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg group-hover:scale-105 transition-all duration-300">
                  <Clock className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium mb-2 sm:mb-3 truncate">
                {driverShift === 'Morning' ? '7:00 AM - 1:00 PM' : driverShift === 'Evening' ? '1:00 PM - 7:00 PM' : 'Flexible timing'}
              </p>

              <div className="flex items-center gap-2 px-3 py-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="text-xs font-bold text-orange-700 dark:text-orange-300">Regular Shift</span>
              </div>
            </CardContent>
          </Card>

          {/* Trip Status Card */}
          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all duration-300 sm:hover:scale-[1.02] sm:hover:-translate-y-1 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-100 dark:border-green-900/30">
            <div className="absolute -inset-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-emerald-500" />

            <CardContent className="relative p-3 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1 sm:mb-2">Trip Status</p>
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <p className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors duration-300">
                      {hasActiveTrip ? 'EnRoute' : 'Idle'}
                    </p>
                  </div>
                </div>

                <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg group-hover:scale-105 transition-all duration-300">
                  <Activity className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium mb-2 sm:mb-3">
                {hasActiveTrip ? 'Trip in progress' : 'Ready to start'}
              </p>

              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${hasActiveTrip ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                <div className={`w-2 h-2 rounded-full ${hasActiveTrip ? 'bg-green-600 animate-pulse' : 'bg-gray-400'}`} />
                <span className={`text-xs font-bold ${hasActiveTrip ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}`}>
                  {hasActiveTrip ? 'ON ROUTE' : 'INACTIVE'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Bus & Route Information Section */}
        <div className="animate-slide-in-up">
          <Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] bg-gradient-to-br from-white to-blue-50/30 dark:from-gray-900 dark:to-blue-950/20 border-2 border-blue-100 dark:border-blue-900/30">
            {/* Top gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

            {/* Decorative background pattern */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />

            <CardHeader className="pb-3 sm:pb-4 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-4">
                  {/* Animated icon */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl blur-md opacity-50 group-hover:blur-lg transition-all duration-300" />
                    <div className="relative p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg group-hover:scale-110 transition-all duration-300">
                      <Bus className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">Bus & Route Details</h3>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium mt-0.5">Complete information</p>
                  </div>
                </div>

                {/* View Details Badge */}
                <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors text-[10px] sm:text-xs px-2 py-0.5">
                  <Info className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                  Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {(busData || routeData) ? (
                <div className="space-y-4">
                  {/* Enhanced Bus Details Grid */}
                  <div className="bg-gradient-to-br from-gray-50 to-blue-50/50 dark:from-gray-800/50 dark:to-blue-900/10 rounded-lg sm:rounded-xl p-3 sm:p-5 border border-gray-200 dark:border-gray-700 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-all duration-300 shadow-sm hover:shadow-md">
                    {/* Card Header */}
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <Bus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                      <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Bus Details</h4>
                    </div>

                    {/* Enhanced Details Grid - 2 columns on mobile */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6 mb-3 sm:mb-5">
                      <div className="group/item space-y-1 sm:space-y-1.5">
                        <p className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <Navigation className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-500" />
                          Route
                        </p>
                        <p className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 group-hover/item:text-blue-700 dark:group-hover/item:text-blue-300 transition-colors truncate">
                          {busData ? `Route-${busData.id?.replace('bus_', '') || busData.busId?.replace('bus_', '') || 'N/A'}` : 'N/A'}
                        </p>
                      </div>
                      <div className="group/item space-y-1 sm:space-y-1.5">
                        <p className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <Bus className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-purple-500" />
                          Bus Number
                        </p>
                        <p className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 group-hover/item:text-purple-700 dark:group-hover/item:text-purple-300 transition-colors truncate">
                          {busData?.busNumber || busData?.id || 'N/A'}
                        </p>
                      </div>
                      <div className="group/item space-y-1 sm:space-y-1.5">
                        <div className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-gradient-to-br from-red-500 to-yellow-500" />
                          Color
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white group-hover/item:text-gray-700 dark:group-hover/item:text-gray-300 transition-colors truncate">
                            {busData?.color || busData?.busColor || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="group/item space-y-1 sm:space-y-1.5">
                        <p className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500" />
                          Capacity
                        </p>
                        <p className="text-xs sm:text-sm font-bold text-green-600 dark:text-green-400 group-hover/item:text-green-700 dark:group-hover/item:text-green-300 transition-colors truncate">
                          {busData?.totalCapacity ? `${busData.currentMembers || 0}/${busData.totalCapacity}` : busData?.capacity || 'N/A'}
                        </p>
                      </div>
                      <div className="group/item space-y-1 sm:space-y-1.5">
                        <p className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-500" />
                          Status
                        </p>
                        <Badge className={`text-[10px] sm:text-xs font-bold ${(busData?.status?.toLowerCase() === 'active' || busData?.status?.toLowerCase() === 'enroute')
                          ? 'bg-green-500 text-white'
                          : busData?.status?.toLowerCase() === 'maintenance'
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-500 text-white'
                          }`}>
                          {busData?.status || 'Unknown'}
                        </Badge>
                      </div>
                    </div>

                    {/* Enhanced Divider - Left Aligned */}
                    <div className="relative my-4 sm:my-5">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                      </div>
                      <div className="relative flex justify-start">
                        <span className="bg-gray-50 dark:bg-gray-800 pr-3 text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Route Details
                        </span>
                      </div>
                    </div>

                    {/* All Stops */}
                    {routeData?.stops && routeData.stops.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
                          <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">All Stops</p>
                          <Badge variant="secondary" className="text-[10px] sm:text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5">
                            {routeData.stops.length} stops
                          </Badge>
                        </div>

                        {/* Horizontal scrollable stops container */}
                        <div className="relative">
                          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {(typeof routeData.stops[0] === 'object' ?
                              routeData.stops.map((stop: any, idx: number) => (
                                <div key={idx} className="flex-shrink-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 min-w-fit group-hover:from-blue-100 dark:group-hover:from-blue-900/30 group-hover:to-indigo-100 dark:group-hover:to-indigo-900/30 transition-all duration-300">
                                    <div className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 bg-blue-500 text-white text-[10px] sm:text-xs font-bold rounded-full">
                                      {idx + 1}
                                    </div>
                                    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                      {stop.name || stop}
                                    </span>
                                  </div>
                                </div>
                              )) :
                              routeData.stops.map((stop: any, idx: number) => (
                                <div key={idx} className="flex-shrink-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 min-w-fit group-hover:from-blue-100 dark:group-hover:from-blue-900/30 group-hover:to-indigo-100 dark:group-hover:to-indigo-900/30 transition-all duration-300">
                                    <div className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 bg-blue-500 text-white text-[10px] sm:text-xs font-bold rounded-full">
                                      {idx + 1}
                                    </div>
                                    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                      {typeof stop === 'string' ? stop : stop.name || stop.stopId || `Stop ${idx + 1}`}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Gradient fade indicators */}
                          <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none"></div>
                          <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-white dark:from-gray-900 to-transparent pointer-events-none"></div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">No route stops available</p>
                      </div>
                    )}
                  </div>

                  {/* View Details link removed as the page has been replaced by Swap and Live Tracking */}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Bus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No bus or route assigned</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Contact admin for assignment</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Premium Quick Actions - 2x3 Grid Layout */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          <Link href="/driver/live-tracking" className="group relative block">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-purple-600 opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300 rounded-3xl" />

            <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/30">
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Decorative corner accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-400 to-purple-600 opacity-5 rounded-bl-full" />

              <CardContent className="relative p-3 sm:p-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  {/* Icon with glow */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300" />
                    <div className="relative p-2 sm:p-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <Navigation className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Live Location</h4>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">Start/end trips</p>

                    {/* Arrow indicator */}
                    <div className="mt-1 sm:mt-3 flex items-center gap-1 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] sm:text-xs font-bold">Open</span>
                      <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/scan-pass" className="group relative block">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-600 opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300 rounded-3xl" />

            <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/30">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-400 to-cyan-600 opacity-5 rounded-bl-full" />

              <CardContent className="relative p-3 sm:p-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300" />
                    <div className="relative p-2 sm:p-4 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <QrCode className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Scan Pass</h4>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">Verify students</p>

                    <div className="mt-1 sm:mt-3 flex items-center gap-1 text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] sm:text-xs font-bold">Open</span>
                      <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/students" className="group relative block">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300 rounded-3xl" />

            <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/30">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 opacity-5 rounded-bl-full" />

              <CardContent className="relative p-3 sm:p-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300" />
                    <div className="relative p-2 sm:p-4 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <Users className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Students</h4>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">View assigned</p>

                    <div className="mt-1 sm:mt-3 flex items-center gap-1 text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] sm:text-xs font-bold">Open</span>
                      <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/swap-request" className="group relative block">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300 rounded-3xl" />

            <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/30">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-600 opacity-5 rounded-bl-full" />

              <CardContent className="relative p-3 sm:p-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300" />
                    <div className="relative p-2 sm:p-4 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <ArrowRight className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Driver Swap</h4>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">Request swap</p>

                    <div className="mt-1 sm:mt-3 flex items-center gap-1 text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] sm:text-xs font-bold">Open</span>
                      <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/notifications" className="group relative block">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-pink-600 opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300 rounded-3xl" />

            <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/30">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-rose-400 to-pink-600 opacity-5 rounded-bl-full" />

              <CardContent className="relative p-3 sm:p-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300" />
                    <div className="relative p-2 sm:p-4 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <Bell className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">Notifications</h4>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">View updates</p>

                    <div className="mt-1 sm:mt-3 flex items-center gap-1 text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] sm:text-xs font-bold">Open</span>
                      <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/profile" className="group relative block">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-600 opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300 rounded-3xl" />

            <Card className="relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/30">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-red-400 to-rose-600 opacity-5 rounded-bl-full" />

              <CardContent className="relative p-3 sm:p-6">
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl blur-lg opacity-0 group-hover:opacity-30 transition-all duration-300" />
                    <div className="relative p-2 sm:p-4 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-2xl group-hover:scale-105 transition-all duration-300">
                      <User className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Profile</h4>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">View profile</p>

                    <div className="mt-1 sm:mt-3 flex items-center gap-1 text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] sm:text-xs font-bold">Open</span>
                      <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Additional Quick Cards - Performance and Tips */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Driver Performance Card */}
          <Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] bg-gradient-to-br from-white to-green-50/30 dark:from-gray-800 dark:to-green-950/30 border-2 border-green-100 dark:border-green-800/50">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />

            <CardHeader className="relative pb-2 sm:pb-3 pt-3 sm:pt-6 px-3 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Award className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Performance Metrics</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">Your driving stats</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative pt-0">
              <div className="grid grid-cols-2 gap-2 sm:gap-4">

                {/* Employee ID Card */}
                <div className="p-3 sm:p-4 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-950/40 rounded-xl border border-gray-100 dark:border-white/10 flex flex-col justify-between h-32 sm:h-40 shadow-sm hover:shadow-md transition-all duration-300">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                        <Hash className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-[10px] sm:text-xs font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-wider">Employee ID</p>
                    </div>
                    <p className="text-lg sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 break-all mt-2 tracking-tight">
                      {driverData?.driverId || driverData?.employeeId || 'N/A'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-emerald-400"></div>
                    <p className="text-[10px] sm:text-xs font-medium text-emerald-600 dark:text-emerald-300 opacity-80">Official ID</p>
                  </div>
                </div>

                {/* Experience Card */}
                <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-xl border border-gray-100 dark:border-white/10 flex flex-col justify-between h-32 sm:h-40 shadow-sm hover:shadow-md transition-all duration-300">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-500/20">
                        <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <p className="text-[10px] sm:text-xs font-bold text-blue-900 dark:text-blue-100 uppercase tracking-wider">Experience</p>
                    </div>
                    <p className="text-base sm:text-xl font-black text-blue-700 dark:text-blue-400 leading-tight mt-2 tracking-tight">
                      {(() => {
                        if (!driverData?.joiningDate) return 'N/A';
                        const now = new Date();
                        const joiningDate = new Date(driverData.joiningDate);
                        const diff = now.getTime() - joiningDate.getTime();
                        const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
                        const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));

                        let text = '';
                        if (years > 0) text += `${years} year${years !== 1 ? 's' : ''} `;
                        if (months > 0) text += `${months} month${months !== 1 ? 's' : ''}`;
                        if (!text) return '0 months';
                        return text.trim();
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                    <p className="text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-300 opacity-80">Total service</p>
                  </div>
                </div>

                {/* License Number Card */}
                <div className="p-3 sm:p-4 bg-gradient-to-br from-purple-50/80 to-pink-50/80 dark:from-purple-950/40 dark:to-pink-950/40 rounded-xl border border-gray-100 dark:border-white/10 flex flex-col justify-between h-32 sm:h-40 shadow-sm hover:shadow-md transition-all duration-300">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-500/20">
                        <CreditCard className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <p className="text-[10px] sm:text-xs font-bold text-purple-900 dark:text-purple-100 uppercase tracking-wider">License ID</p>
                    </div>
                    <p className="text-sm sm:text-xl font-black text-purple-700 dark:text-purple-400 mt-2 tracking-tight break-all" title={licenseNumber}>
                      {licenseNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-purple-400"></div>
                    <p className="text-[10px] sm:text-xs font-medium text-purple-600 dark:text-purple-300 opacity-80">Official Document</p>
                  </div>
                </div>

                {/* Seats Left Card */}
                <div className="p-3 sm:p-4 bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-950/40 dark:to-orange-950/40 rounded-xl border border-gray-100 dark:border-white/10 flex flex-col justify-between h-32 sm:h-40 shadow-sm hover:shadow-md transition-all duration-300">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 sm:mb-3">
                      <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-500/20">
                        <Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <p className="text-[10px] sm:text-xs font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wider">Seats Left</p>
                    </div>

                    <div className="space-y-1 sm:space-y-2.5">
                      {!busData ? (
                        <div className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="text-amber-700 dark:text-amber-300/80 font-medium italic opacity-60">Status</span>
                          <span className="font-black text-amber-700 dark:text-amber-400 text-sm sm:text-base uppercase tracking-tighter">Reserved</span>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 w-full pt-1">
                          {(busData?.shift === 'Morning' || busData?.shift === 'Both' || busData?.shift === 'Morning & Evening Shift' || !busData?.shift) && (
                            <div className="flex items-center justify-between sm:justify-start gap-1.5 text-xs sm:text-[11px] lg:text-xs">
                              <span className="text-amber-700 dark:text-amber-300/80 font-medium">Morning:</span>
                              <span className="font-black text-amber-700 dark:text-amber-400 text-sm">
                                {Math.max(0, (busData?.capacity || 50) - (busData?.load?.morningCount || 0))}
                              </span>
                            </div>
                          )}

                          {busData?.shift && busData.shift !== 'Morning' && <div className="hidden sm:block w-px h-3 bg-amber-300 dark:bg-amber-600 opacity-30"></div>}

                          {(busData?.shift === 'Evening' || busData?.shift === 'Both' || busData?.shift === 'Morning & Evening Shift') ? (
                            <div className="flex items-center justify-between sm:justify-start gap-1.5 text-xs sm:text-[11px] lg:text-xs">
                              <span className="text-amber-700 dark:text-amber-300/80 font-medium">Evening:</span>
                              <span className="font-black text-amber-700 dark:text-amber-400 text-sm">
                                {Math.max(0, (busData?.capacity || 50) - (busData?.load?.eveningCount || 0))}
                              </span>
                            </div>
                          ) : (
                            (busData?.shift === 'Morning') && (
                              <div className="flex items-center justify-between sm:justify-start gap-1.5 text-xs sm:text-[11px] lg:text-xs">
                                <span className="text-amber-700 dark:text-amber-300/80 font-medium">Eve:</span>
                                <span className="font-bold text-amber-600/50 dark:text-amber-400/50 text-[10px] uppercase">None</span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1.5 sm:pt-2 border-t border-amber-200/50 dark:border-amber-500/10">
                    <span className="text-[10px] sm:text-xs font-medium text-amber-600 dark:text-amber-300 opacity-80">
                      Capacity: <span className="font-bold">{busData?.capacity || 50}</span>
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card >

          {/* Quick Tips Card */}
          < Card className="group relative overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.01] bg-gradient-to-br from-white to-indigo-50/30 dark:from-gray-800 dark:to-indigo-950/30 border-2 border-indigo-100 dark:border-indigo-800/50" >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />

            <CardHeader className="relative pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Quick Tips</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Best practices for drivers</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative space-y-3">
              <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-lg border border-indigo-200 dark:border-indigo-700/50">
                <div className="p-1.5 rounded-full bg-indigo-500 mt-0.5">
                  <CheckCircle className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">Always verify student IDs</p>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">Scan QR codes before boarding</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-700/50">
                <div className="p-1.5 rounded-full bg-blue-500 mt-0.5">
                  <Shield className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Follow route schedule</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Stick to assigned stops and timings</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg border border-green-200 dark:border-green-700/50">
                <div className="p-1.5 rounded-full bg-green-500 mt-0.5">
                  <Bell className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-green-900 dark:text-green-100">Check notifications regularly</p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">Stay updated with important alerts</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-lg border border-orange-200 dark:border-orange-700/50">
                <div className="p-1.5 rounded-full bg-orange-500 mt-0.5">
                  <Monitor className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-orange-900 dark:text-orange-100">Use Chrome Browser</p>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">For smooth experience and best performance</p>
                </div>
              </div>
            </CardContent>
          </Card >
        </div >
      </div >
    </div >
  );
}
