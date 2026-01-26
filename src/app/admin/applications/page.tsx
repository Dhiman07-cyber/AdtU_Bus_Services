"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
// SPARK PLAN SAFETY: Manual refresh only for applications page
import { usePaginatedCollection, invalidateCollectionCache } from '@/hooks/usePaginatedCollection';
import {
  FileText, Shield, Eye, Check, X, Loader2, Search, Filter,
  SlidersHorizontal, User, Phone, Calendar, Clock, Bus as BusIcon,
  ChevronDown, RefreshCw, AlertTriangle, ExternalLink, ArrowRightLeft
} from "lucide-react";
import { PageHeader } from "@/components/application/page-header";
import { StatusBadge } from "@/components/application/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PremiumPageLoader } from '@/components/LoadingSpinner';

export default function AdminApplicationsPage() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();

  // SPARK PLAN SAFETY: Manual refresh only - no auto-polling to conserve quota
  const { data: pendingApplications, loading, refresh: refreshApplications } = usePaginatedCollection('applications', {
    pageSize: 50, orderByField: 'createdAt', orderDirection: 'desc',
    autoRefresh: false, // MANUAL REFRESH ONLY
  });
  const { data: routes, loading: routesLoading, refresh: refreshRoutes } = usePaginatedCollection('routes', {
    pageSize: 50, orderByField: 'routeName', orderDirection: 'asc',
    autoRefresh: false,
  });
  const { data: buses, loading: busesLoading, refresh: refreshBuses } = usePaginatedCollection('buses', {
    pageSize: 50, orderByField: 'busNumber', orderDirection: 'asc',
    autoRefresh: false,
  });

  const [error, setError] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // Manual refresh handler for applications page
  const handleRefresh = async () => {
    setIsRefreshing(true);
    invalidateCollectionCache('applications');
    await Promise.all([refreshApplications(), refreshRoutes(), refreshBuses()]);
    setIsRefreshing(false);
  };

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState<string[]>([]);

  // Redirect if user is not an admin
  useEffect(() => {
    if (userData && userData.role !== "admin") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  // Filter submitted applications only (from APPLICATIONS collection)
  const applicationApplications = pendingApplications.filter((app: any) =>
    app.state === 'submitted'
  );

  // Function to get bus display from route information
  const getBusDisplayFromRoute = (routeId: string) => {
    if (!routeId) return 'Not Assigned';

    // If routes/buses are still loading, show loading state
    if (routesLoading || busesLoading) return 'Loading...';

    // Find the route
    const route = routes?.find(r => r.routeId === routeId || r.id === routeId);
    if (!route) {
      // Extract route number from routeId (e.g., "route_01" -> "01")
      const routeNum = routeId.replace(/\D/g, '');
      return routeNum ? `Route ${routeNum}` : routeId;
    }

    // Get bus information from route
    const busId = route.busId || route.assignedBusId;
    if (!busId) return `Route ${route.routeName || routeId}`;

    // Find the bus
    const bus = buses?.find(b => b.busId === busId || b.id === busId);
    if (!bus) {
      const busNum = busId.replace(/\D/g, '') || '?';
      return `Bus ${busNum}`;
    }

    return `${bus.busNumber || 'Bus'} (${route.routeName || 'Route'})`;
  };

  /**
   * Real-time capacity status check for an application.
   * Checks if the selected bus is at capacity for the student's shift.
   * Returns: { needsCapacityReview, reassignmentReason, busNumber, shift }
   */
  const getCapacityStatus = (item: any): {
    needsCapacityReview: boolean;
    reassignmentReason: 'bus_full_only_option' | 'bus_full_alternatives_exist' | 'no_issue';
    busNumber: string;
    shift: string;
  } => {
    // If stored data already has capacity review info, use it
    if (item.needsCapacityReview && item.reassignmentReason) {
      return {
        needsCapacityReview: item.needsCapacityReview,
        reassignmentReason: item.reassignmentReason,
        busNumber: item.formData?.busAssigned || 'Unknown',
        shift: item.formData?.shift || 'Morning'
      };
    }

    // Real-time check from loaded buses data
    const busId = item.formData?.busId;
    const routeId = item.formData?.routeId;
    const stopId = item.formData?.stopId;
    const studentShift = (item.formData?.shift || 'Morning').toLowerCase();

    if (!busId || buses.length === 0) {
      return { needsCapacityReview: false, reassignmentReason: 'no_issue', busNumber: 'Unknown', shift: studentShift };
    }

    // Find the selected bus
    const selectedBus = buses.find((b: any) => b.id === busId || b.busId === busId);
    if (!selectedBus) {
      return { needsCapacityReview: false, reassignmentReason: 'no_issue', busNumber: 'Unknown', shift: studentShift };
    }

    const busNumber = selectedBus.busNumber || `Bus-${busId}`;
    const totalCapacity = selectedBus.totalCapacity || selectedBus.capacity || 50;

    // Get shift-specific load from bus document
    let shiftLoad = 0;
    if (studentShift === 'morning') {
      shiftLoad = selectedBus.load?.morningCount ?? selectedBus.morningLoad ?? 0;
    } else if (studentShift === 'evening') {
      shiftLoad = selectedBus.load?.eveningCount ?? selectedBus.eveningLoad ?? 0;
    } else {
      const morningLoad = selectedBus.load?.morningCount ?? selectedBus.morningLoad ?? 0;
      const eveningLoad = selectedBus.load?.eveningCount ?? selectedBus.eveningLoad ?? 0;
      shiftLoad = Math.max(morningLoad, eveningLoad);
    }

    const availableSeats = totalCapacity - shiftLoad;
    const isFull = availableSeats <= 0;

    if (!isFull) {
      return { needsCapacityReview: false, reassignmentReason: 'no_issue', busNumber, shift: studentShift };
    }

    // Bus is full - check if alternatives exist for this stop
    const stopName = item.formData?.stopName || '';
    const normalizedStopId = (stopId || '').toLowerCase().trim();
    const normalizedStopName = stopName.toLowerCase().trim();

    // Find routes that have this stop
    const matchingRouteIds: string[] = [];
    routes.forEach((route: any) => {
      const routeStops = route.stops || [];
      const hasStop = routeStops.some((stop: any) => {
        const routeStopId = (stop.stopId || stop.id || stop.name || '').toLowerCase().trim();
        const routeStopName = (stop.name || stop.stopName || '').toLowerCase().trim();
        return routeStopId === normalizedStopId || routeStopName === normalizedStopName ||
          routeStopName === normalizedStopId || routeStopId === normalizedStopName;
      });
      if (hasStop) {
        matchingRouteIds.push(route.routeId || route.id);
      }
    });

    // Find alternative buses
    const alternativeBuses = buses.filter((bus: any) => {
      if ((bus.id || bus.busId) === busId) return false;
      if (!matchingRouteIds.includes(bus.routeId)) return false;

      const busShift = (bus.shift || 'Both').toLowerCase();
      if (studentShift === 'morning' && busShift !== 'morning' && busShift !== 'both') return false;
      if (studentShift === 'evening' && busShift !== 'both') return false;

      const busTotalCapacity = bus.totalCapacity || bus.capacity || 50;
      let busShiftLoad = 0;
      if (studentShift === 'morning') {
        busShiftLoad = bus.load?.morningCount ?? bus.morningLoad ?? 0;
      } else if (studentShift === 'evening') {
        busShiftLoad = bus.load?.eveningCount ?? bus.eveningLoad ?? 0;
      }

      return (busTotalCapacity - busShiftLoad) > 0;
    });

    if (alternativeBuses.length > 0) {
      return { needsCapacityReview: true, reassignmentReason: 'bus_full_alternatives_exist', busNumber, shift: studentShift };
    } else {
      return { needsCapacityReview: true, reassignmentReason: 'bus_full_only_option', busNumber, shift: studentShift };
    }
  };

  // Filtered and searched data
  const filteredData = useMemo(() => {
    let data = applicationApplications;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      data = data.filter((item: any) => {
        return (
          item.formData?.fullName?.toLowerCase().includes(query) ||
          item.formData?.enrollmentId?.toLowerCase().includes(query) ||
          item.formData?.phoneNumber?.includes(query)
        );
      });
    }

    // Apply shift filter - logic corrected to be more inclusive
    if (shiftFilter.length > 0) {
      data = data.filter((item: any) => {
        const itemShift = (item.formData?.shift || 'both').toLowerCase();
        return shiftFilter.some(f => {
          if (f === 'morning') return itemShift === 'morning' || itemShift === 'both';
          if (f === 'evening') return itemShift === 'evening' || itemShift === 'both';
          if (f === 'both') return itemShift === 'both';
          return false;
        });
      });
    }

    // Filter out processed IDs (optimistic update)
    if (processedIds.size > 0) {
      data = data.filter((item: any) => !processedIds.has(item.applicationId || item.uid));
    }

    return data;
  }, [applicationApplications, searchQuery, shiftFilter, processedIds]);

  // Approve an application
  const handleApprove = async (applicationId: string) => {
    if (!currentUser) return;

    setApproving(applicationId);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/applications/approve-unauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ studentUid: applicationId }) // applicationId is the same as studentUid
      });

      if (response.ok) {
        setError("");
        // Optimistically hide the card
        setProcessedIds(prev => {
          const newSet = new Set(prev);
          newSet.add(applicationId);
          return newSet;
        });
        await handleRefresh();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to approve application");
      }
    } catch (error) {
      console.error("Error approving application:", error);
      setError("Failed to approve application");
    } finally {
      setApproving(null);
    }
  };

  // Rejection Dialog State
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null);

  // Open rejection dialog
  const handleRejectClick = (applicationId: string) => {
    setSelectedApplication(applicationId);
    setRejectionReason("");
    setShowRejectDialog(true);
  };

  // Confirm rejection
  const confirmReject = async () => {
    if (!currentUser || !selectedApplication || !rejectionReason.trim()) return;

    setRejecting(selectedApplication);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/applications/reject-unauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ studentUid: selectedApplication, reason: rejectionReason })
      });

      if (response.ok) {
        setError("");
        setShowRejectDialog(false);
        setRejectionReason("");
        // Optimistically hide the card
        if (selectedApplication) {
          setProcessedIds(prev => {
            const newSet = new Set(prev);
            newSet.add(selectedApplication);
            return newSet;
          });
        }
        await handleRefresh();
        setSelectedApplication(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to reject application");
      }
    } catch (error) {
      console.error("Error rejecting application:", error);
      setError("Failed to reject application");
    } finally {
      setRejecting(null);
    }
  };

  if (!currentUser) {
    return (
      <div className="mt-12 min-h-screen flex items-center justify-center p-4">
        <Card>
          <CardContent className="py-8 text-center max-w-md">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
            <p className="text-muted-foreground">
              You need to be signed in as an admin to view applications.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-12 space-y-6">
      {/* Page Header */}
      <div className="space-y-2 mb-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Student Applications</h1>
            <div className="hidden md:block">
              <Badge className="text-[10px] font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-tight rounded-md">
                {filteredData.length} Applications
              </Badge>
            </div>
          </div>
          <Button
            size="sm"
            className="group h-8 px-4 bg-white hover:bg-gray-50 text-gray-600 hover:text-purple-600 border border-gray-200 hover:border-purple-200 shadow-sm hover:shadow-lg hover:shadow-purple-500/10 font-bold text-[10px] uppercase tracking-widest rounded-lg transition-all duration-300 active:scale-95 cursor-pointer shrink-0"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn(`mr-2 h-3.5 w-3.5 transition-transform duration-500`, isRefreshing ? "animate-spin" : "group-hover:rotate-180")} />
            Refresh
          </Button>
        </div>
        <p className="text-zinc-400 text-sm max-w-2xl">
          Review and manage all student bus service applications
        </p>
      </div>

      {/* Filter Toolbar - Full Width Layout */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search by name, enrollment ID, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 w-full bg-[#12131A] border-white/[0.05] focus:border-indigo-500/50 transition-all text-sm"
          />
        </div>

        <div className="flex gap-2">
          {/* Shift Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "hidden md:flex h-10 gap-2 border-white/[0.05] bg-[#12131A] hover:bg-zinc-900 transition-all text-sm px-4",
                  shiftFilter.length > 0 && "border-indigo-500/50 text-indigo-400 font-medium"
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter by Shift
                {shiftFilter.length > 0 && (
                  <Badge className="ml-1 bg-indigo-500 text-white border-none h-5 px-1.5 min-w-[1.25rem] justify-center text-[10px]">
                    {shiftFilter.length}
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#12131A] border-white/[0.1] text-zinc-300">
              <DropdownMenuLabel className="text-zinc-500 text-[10px] uppercase tracking-wider font-bold">Shift Preferences</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/[0.05]" />
              <DropdownMenuCheckboxItem
                checked={shiftFilter.includes('morning')}
                onCheckedChange={(checked) => {
                  setShiftFilter(checked ? [...shiftFilter, 'morning'] : shiftFilter.filter(s => s !== 'morning'));
                }}
                className="cursor-pointer focus:bg-white/[0.05]"
              >
                Morning Shift
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={shiftFilter.includes('evening')}
                onCheckedChange={(checked) => {
                  setShiftFilter(checked ? [...shiftFilter, 'evening'] : shiftFilter.filter(s => s !== 'evening'));
                }}
                className="cursor-pointer focus:bg-white/[0.05]"
              >
                Evening Shift
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={shiftFilter.includes('both')}
                onCheckedChange={(checked) => {
                  setShiftFilter(checked ? [...shiftFilter, 'both'] : shiftFilter.filter(s => s !== 'both'));
                }}
                className="cursor-pointer focus:bg-white/[0.05]"
              >
                Dual Shift (Both)
              </DropdownMenuCheckboxItem>
              {shiftFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-white/[0.05]" />
                  <DropdownMenuItem onClick={() => setShiftFilter([])} className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-400/10">
                    Clear Shift Filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Button */}
          {(shiftFilter.length > 0 || searchQuery !== "") && (
            <Button
              variant="ghost"
              onClick={() => {
                setShiftFilter([]);
                setSearchQuery("");
              }}
              className="h-10 px-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all duration-300 border border-red-500/20"
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Content Area */}
      {loading || routesLoading || busesLoading ? (
        <div className="flex justify-center items-center h-96">
          <PremiumPageLoader message="Fetching Student Applications..." />
        </div>
      ) : filteredData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-muted rounded-full">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">No Applications Found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {searchQuery || shiftFilter.length > 0
                    ? 'Try adjusting your filters or search query'
                    : `There are no student applications at the moment`
                  }
                </p>
              </div>
              {(searchQuery || shiftFilter.length > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setShiftFilter([]);
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredData.map((item: any) => {
            // Get real-time capacity status for this application
            const capacityStatus = getCapacityStatus(item);
            const { needsCapacityReview, reassignmentReason, busNumber, shift } = capacityStatus;

            const isExpanded = expandedCards.has(item.applicationId);
            const toggleExpanded = () => {
              setExpandedCards(prev => {
                const next = new Set(prev);
                if (next.has(item.applicationId)) {
                  next.delete(item.applicationId);
                } else {
                  next.add(item.applicationId);
                }
                return next;
              });
            };

            function handleReject(applicationId: any): void {
              throw new Error("Function not implemented.");
            }

            return (
              <Card
                key={item.applicationId}
                className="group transition-all duration-300 border-white/[0.05] bg-[#12131A]/40 hover:bg-indigo-500/[0.03] hover:border-indigo-500/20 overflow-hidden relative"
              >
                {/* Subtle hover accent */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top" />
                <CardContent className="p-5">
                  <div className="flex flex-col gap-2">

                    {/* Header Section: Profile & Status */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-4">
                        <Avatar className="h-12 w-12 ring-2 ring-white/5 bg-zinc-900 shadow-xl">
                          <AvatarImage src={item.formData?.profilePhotoUrl} />
                          <AvatarFallback className="bg-indigo-500/10 text-indigo-400 font-bold">
                            {item.formData?.fullName?.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-base text-white leading-none">{item.formData?.fullName}</h3>
                            <StatusBadge status={item.state || 'submitted'} />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mt-1">
                            <span className="flex items-center gap-1.5 bg-zinc-900/50 px-2.5 py-1.5 md:py-0.5 rounded border border-white/5 font-mono text-[11px] md:text-xs text-zinc-300 w-full md:w-fit break-all">
                              <User className="h-3 w-3 text-zinc-500 shrink-0" />
                              {item.formData?.enrollmentId}
                            </span>
                            <span className="flex items-center gap-1.5 font-mono text-[11px] md:text-xs text-zinc-400 w-full md:w-auto px-1">
                              <Phone className="h-3 w-3 text-zinc-500 shrink-0" />
                              {item.formData?.phoneNumber}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Top Right: Payment Info (Desktop Only) */}
                      <div className="hidden sm:flex flex-col items-end gap-2">
                        <Badge variant="outline" className={cn(
                          "gap-1.5 text-[10px] px-2.5 py-1 h-fit font-medium tracking-wide shadow-sm",
                          item.formData?.paymentInfo?.paymentMode === 'online' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", item.formData?.paymentInfo?.paymentMode === 'online' ? "bg-emerald-400" : "bg-amber-400")} />
                          {item.formData?.paymentInfo?.paymentMode === 'online' ? 'ONLINE' : 'MANUAL'}
                        </Badge>
                        {item.formData?.paymentInfo?.amountPaid && (
                          <span className="text-xs font-mono font-bold text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded border border-white/5">
                            ₹{Number(item.formData.paymentInfo.amountPaid).toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Section: Bus Info & Tags */}
                    <div className="space-y-3 mb-3">
                      {/* Desktop Layout - Unchanged */}
                      <div className="hidden sm:flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1.5 text-[10px] py-1 px-2.5 bg-zinc-800/40 border-white/5 text-zinc-300 group-hover:bg-zinc-800/60 transition-colors">
                          <BusIcon className="h-3 w-3 text-indigo-400" />
                          <span className="font-medium text-white/90">{item.formData?.busAssigned || getBusDisplayFromRoute(item.formData?.routeId)}</span>
                        </Badge>

                        <Badge variant="outline" className="gap-1.5 text-[10px] py-1 px-2.5 bg-zinc-800/40 border-white/5 text-zinc-300 capitalize">
                          <Clock className="h-3 w-3 text-indigo-400" />
                          {item.formData?.shift || 'Morning'}
                        </Badge>

                        {item.formData?.sessionInfo?.durationYears && (
                          <Badge variant="outline" className="gap-1.5 text-[10px] py-1 px-2.5 bg-zinc-800/40 border-white/5 text-zinc-300">
                            <Calendar className="h-3 w-3 text-indigo-400" />
                            {item.formData.sessionInfo.durationYears} Year Plan
                          </Badge>
                        )}

                        {needsCapacityReview && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1.5 text-[10px] py-1 px-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95 select-none",
                              reassignmentReason === 'bus_full_only_option'
                                ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 shadow-[0_0_10px_-3px_rgba(239,68,68,0.3)] animate-pulse"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)]"
                            )}
                            onClick={toggleExpanded}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {reassignmentReason === 'bus_full_only_option' ? "Critical Limit" : "Over Capacity"}
                            <ChevronDown className={cn("h-3 w-3 ml-1 transition-transform duration-300", isExpanded && "rotate-180")} />
                          </Badge>
                        )}
                      </div>

                      {/* Mobile Layout - New Requirements */}
                      <div className="flex md:hidden flex-col gap-2.5 mt-4">
                        {/* Row 1: Amount - Squared Badge */}
                        {item.formData?.paymentInfo?.amountPaid && (
                          <div className="w-full bg-zinc-900/80 border border-zinc-800 rounded-none py-2 px-3 flex justify-center items-center shadow-sm">
                            <span className="text-[13px] font-mono font-bold text-zinc-200 tracking-wide uppercase">
                              PAYMENT AMOUNT : ₹{Number(item.formData.paymentInfo.amountPaid).toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}

                        {/* Row 2: Bus & Shift - Rounded Badges */}
                        <div className="grid grid-cols-2 gap-2">
                          <Badge variant="outline" className="justify-center h-9 text-[11px] border-white/10 bg-zinc-800/50 text-zinc-200 rounded-full font-medium">
                            <BusIcon className="h-3.5 w-3.5 mr-1.5 text-indigo-400 shrink-0" />
                            <span className="truncate">{item.formData?.busAssigned || getBusDisplayFromRoute(item.formData?.routeId)}</span>
                          </Badge>
                          <Badge variant="outline" className="justify-center h-9 text-[11px] border-white/10 bg-zinc-800/50 text-zinc-200 rounded-full font-medium capitalize">
                            <Clock className="h-3.5 w-3.5 mr-1.5 text-indigo-400 shrink-0" />
                            {item.formData?.shift || 'Morning'}
                          </Badge>
                        </div>

                        {/* Row 3: Duration & Payment Mode - Mode Highlighted */}
                        <div className="grid grid-cols-2 gap-2">
                          <Badge variant="outline" className="justify-center h-9 text-[11px] border-white/10 bg-zinc-800/50 text-zinc-200 rounded-full font-medium">
                            <Calendar className="h-3.5 w-3.5 mr-1.5 text-indigo-400 shrink-0" />
                            {item.formData?.sessionInfo?.durationYears ? `${item.formData.sessionInfo.durationYears} Year Plan` : 'N/A'}
                          </Badge>

                          <Badge variant="outline" className={cn(
                            "justify-center h-9 text-[11px] border-none font-bold rounded-full",
                            item.formData?.paymentInfo?.paymentMode === 'online'
                              ? "bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                              : "bg-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                          )}>
                            {item.formData?.paymentInfo?.paymentMode === 'online' ? 'ONLINE' : 'MANUAL'}
                          </Badge>
                        </div>

                        {/* Mobile Capacity Warning */}
                        {needsCapacityReview && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "w-full justify-center py-2 mt-1 text-[11px] cursor-pointer select-none rounded-lg",
                              reassignmentReason === 'bus_full_only_option'
                                ? "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            )}
                            onClick={toggleExpanded}
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            {reassignmentReason === 'bus_full_only_option' ? "Critical Limit - Tap to Review" : "Over Capacity - Tap to Review"}
                          </Badge>
                        )}
                      </div>

                      {/* Capacity Warning Expansion */}
                      {needsCapacityReview && isExpanded && (
                        <div className={cn(
                          "mt-3 rounded-lg p-3 border animate-in slide-in-from-top-2 fade-in duration-200",
                          reassignmentReason === 'bus_full_only_option'
                            ? "bg-red-500/5 border-red-500/20"
                            : "bg-amber-500/5 border-amber-500/20"
                        )}>
                          <div className="flex items-start gap-2">
                            <AlertTriangle className={cn(
                              "h-4 w-4 shrink-0 mt-0.5",
                              reassignmentReason === 'bus_full_only_option' ? "text-red-400" : "text-amber-400"
                            )} />
                            <div className="flex-1 space-y-2">
                              <h4 className={cn(
                                "font-semibold text-xs",
                                reassignmentReason === 'bus_full_only_option' ? "text-red-400" : "text-amber-400"
                              )}>
                                {reassignmentReason === 'bus_full_only_option'
                                  ? "Action Required: No Alternative Buses"
                                  : "Warning: Bus Overloaded"}
                              </h4>
                              <div className="space-y-2">
                                <p className="text-[11px] text-zinc-400 leading-relaxed">
                                  {reassignmentReason === 'bus_full_only_option'
                                    ? `Bus ${busNumber} (${shift}) is at full capacity. This is the only bus serving the student's stop. You must reassign other students or add bus capacity before approving.`
                                    : `Bus ${busNumber} (${shift}) exceeds capacity. Alternative buses are available for this route/stop. Please check reassignment options.`}
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={cn(
                                    "h-7 text-[10px] gap-1.5 w-full sm:w-auto transition-colors",
                                    reassignmentReason === 'bus_full_only_option'
                                      ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                                      : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                  )}
                                  onClick={() => router.push('/admin/smart-allocation')}
                                >
                                  <ArrowRightLeft className="h-3 w-3" />
                                  Manage Allocations
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer: Actions - Equal Length Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                      <Button
                        variant="outline"
                        className="w-full bg-white hover:bg-gray-100 text-black border-transparent shadow-sm font-medium h-10 gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        onClick={() => router.push(`/admin/applications/${item.applicationId}`)}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>

                      <Button
                        className={cn(
                          "w-full h-10 gap-2 font-medium shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all",
                          needsCapacityReview
                            ? "bg-emerald-600/50 text-white/50 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white"
                        )}
                        onClick={() => handleApprove(item.applicationId)}
                        disabled={needsCapacityReview || approving === item.applicationId}
                      >
                        {approving === item.applicationId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Approve
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full h-10 gap-2 border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => handleRejectClick(item.applicationId)}
                        disabled={rejecting === item.applicationId}
                      >
                        {rejecting === item.applicationId ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {/* Rejection Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-[425px] bg-[#12131A] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Please provide a reason for rejecting this student application.
              The student will be notified via email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason" className="text-zinc-300">Rejection Reason</Label>
              <Textarea
                id="reason"
                className="bg-zinc-900/50 border-white/10 focus:border-red-500/50 min-h-[100px] text-zinc-200 resize-none"
                placeholder="e.g., Incorrect profile photo, Payment proof unclear, Invalid enrollment ID..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectionReason.trim() || rejecting !== null}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
