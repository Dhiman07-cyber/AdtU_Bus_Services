"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Bus,
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  RefreshCw
} from "lucide-react";
import { getDriverById as getDriverByUid, getBusById, getAllDrivers } from "@/lib/dataService";
import { useToast } from "@/contexts/toast-context";

export default function DriverSwapPage() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();
  const [driverData, setDriverData] = useState<any>(null);
  const [currentBus, setCurrentBus] = useState<any>(null);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch swap requests
  const fetchSwapRequests = async (driverUid: string) => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      // Fetch pending swap requests where this driver is either the requester or target
      const response = await fetch('/api/driver-swap/requests?type=all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();

      if (response.ok) {
        setSwapRequests(result.requests || []);
      }
    } catch (error) {
      console.error("Error fetching swap requests:", error);
    }
  };

  const fetchData = useCallback(async () => {
    if (!currentUser?.uid) return;

    // Only set loading on initial load, not refresh
    if (!driverData) setLoading(true);

    try {
      // Fetch driver data
      const driver = await getDriverByUid(currentUser.uid);
      if (driver) {
        setDriverData(driver);

        // Fetch current bus
        if (driver.assignedBusId) {
          const bus = await getBusById(driver.assignedBusId);
          if (bus) {
            setCurrentBus(bus);
          }
        }

        // Fetch all available drivers
        console.log('Fetching all drivers');
        const drivers = await getAllDrivers();
        console.log('All drivers:', drivers);
        // Filter out the current driver
        const available = drivers.filter((d: any) => d.uid !== driver.uid);
        console.log('Available drivers:', available);
        setAvailableDrivers(available);

        // Fetch existing swap requests
        await fetchSwapRequests(driver.uid);
      } else {
        setError("Driver data not found");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [currentUser, driverData]);

  // Fetch driver data and available drivers
  useEffect(() => {
    fetchData();
  }, [currentUser]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    addToast('Data refreshed', 'success');
    setIsRefreshing(false);
  };

  // Redirect if user is not a driver
  useEffect(() => {
    if (userData && userData.role !== "driver") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  const handleSwapRequest = async () => {
    if (!driverData?.assignedBusId || !selectedDriverId || !currentUser) return;

    setSendingRequest(true);
    try {
      // Get Firebase ID token
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      // Create swap request via API
      const response = await fetch('/api/driver/swap-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          busId: driverData.assignedBusId,
          toDriverUid: selectedDriverId,
          idToken: token
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Show success message
        alert("Swap request submitted successfully!");
        setSelectedDriverId("");
        // Refresh swap requests
        await fetchSwapRequests(driverData.uid);
      } else {
        throw new Error(result.error || "Failed to create swap request");
      }
    } catch (error: any) {
      console.error("Error submitting swap request:", error);
      setError(error.message || "Failed to submit swap request");
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptSwap = async (swapRequestId: string) => {
    try {
      // Get Firebase ID token
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      // Accept swap request via API
      const response = await fetch('/api/driver/accept-swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          swapRequestId,
          idToken: token
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Show success message
        alert("Swap request accepted successfully!");
        // Refresh swap requests
        await fetchSwapRequests(driverData.uid);
        // Refresh driver data
        const driver = await getDriverByUid(currentUser.uid);
        if (driver) {
          setDriverData(driver);
          if (driver.assignedBusId) {
            const bus = await getBusById(driver.assignedBusId);
            if (bus) {
              setCurrentBus(bus);
            }
          }
        }
      } else {
        throw new Error(result.error || "Failed to accept swap request");
      }
    } catch (error: any) {
      console.error("Error accepting swap request:", error);
      setError(error.message || "Failed to accept swap request");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Driver Swap</CardTitle>
            <CardDescription>Error loading swap information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 text-red-500">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!driverData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Driver Swap</CardTitle>
            <CardDescription>No driver assignment found</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">
              You haven't been assigned to a bus yet. Please check back later or contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold dark:text-white">Driver Swap</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your bus assignments and swaps
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="group h-8 px-4 bg-white hover:bg-gray-50 text-gray-600 hover:text-purple-600 border border-gray-200 hover:border-purple-200 shadow-sm hover:shadow-lg hover:shadow-purple-500/10 font-bold text-[10px] uppercase tracking-widest rounded-lg transition-all duration-300 active:scale-95"
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 transition-transform duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
          Refresh
        </Button>
      </div>

      {/* Current Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Current Assignment</CardTitle>
          <CardDescription>
            Your currently assigned bus
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentBus ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Bus className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">{currentBus.busNumber}</p>
                  <p className="text-sm text-muted-foreground">Current Bus</p>
                </div>
              </div>
              <Badge variant="default">Assigned</Badge>
            </div>
          ) : (
            <p className="text-muted-foreground">No bus assigned</p>
          )}
        </CardContent>
      </Card>

      {/* Pending Swap Requests */}
      {swapRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Swap Requests</CardTitle>
            <CardDescription>
              Incoming and outgoing swap requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {swapRequests.map((request) => (
                <div key={request.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {request.fromDriverUid === driverData.uid
                          ? `Request to swap with ${request.toDriverName || request.toDriverUid}`
                          : `Swap request from ${request.fromDriverName || request.fromDriverUid}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Bus: {request.busId} • Status: {request.status}
                      </p>
                    </div>
                    <Badge variant={request.status === 'pending' ? 'secondary' : 'default'}>
                      {request.status}
                    </Badge>
                  </div>

                  {request.status === 'pending' && request.toDriverUid === driverData.uid && (
                    <div className="mt-3 flex space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptSwap(request.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Drivers */}
      <Card>
        <CardHeader>
          <CardTitle>Available Drivers</CardTitle>
          <CardDescription>
            Select a driver to request a swap
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableDrivers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium">No Available Drivers</h3>
              <p className="mt-1 text-muted-foreground">
                There are no other drivers available for swapping at this time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {availableDrivers.map((driver) => (
                <div
                  key={driver.uid}
                  className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer ${selectedDriverId === driver.uid
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  onClick={() => setSelectedDriverId(driver.uid)}
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-gray-100 p-3 rounded-full">
                      <Users className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium">{driver.name || driver.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {driver.assignedBusId ? `Assigned to ${driver.assignedBusId}` : "No bus assigned"}
                      </p>
                    </div>
                  </div>
                  {selectedDriverId === driver.uid && (
                    <CheckCircle className="h-5 w-5 text-blue-500" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Swap Request Form */}
      <Card>
        <CardHeader>
          <CardTitle>Request Driver Swap</CardTitle>
          <CardDescription>
            Submit a request to swap with another driver
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Reason for Swap (Optional)</label>
              <textarea
                className="w-full mt-1 p-2 border rounded-md"
                rows={3}
                placeholder="Explain why you need to swap with this driver..."
              />
            </div>
            <Button
              onClick={handleSwapRequest}
              disabled={!selectedDriverId || !currentBus || sendingRequest}
              className="w-full"
            >
              {sendingRequest ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Sending Request...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Swap Request
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
