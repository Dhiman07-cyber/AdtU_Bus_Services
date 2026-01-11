'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, XCircle, Clock, User, Calendar, Plus, Bus, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { supabase } from '@/lib/supabase-client';

interface Driver {
  [x: string]: string;
  uid: string;
  fullName: string;
  name: string;
  driverId: string;
  phoneNumber: string;
}

interface SwapRequest {
  id: string;
  requester_driver_uid: string;
  requester_name: string;
  bus_id: string;
  route_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  status: string;
  created_at: string;
  meta: any;
}

export default function RequestSwapPage() {
  const { currentUser, userData } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  // State for incoming requests
  const [incomingRequests, setIncomingRequests] = useState<SwapRequest[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // State for create request
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busId, setBusId] = useState('');
  const [routeId, setRouteId] = useState('');

  useEffect(() => {
    if (!currentUser || !userData) {
      router.push('/login');
      return;
    }

    // Fetch current driver's bus and route
    fetchDriverDetails();
    // Fetch available drivers
    fetchDrivers();
    // Fetch incoming requests
    fetchIncomingRequests();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`driver_swap_requests:${currentUser.uid}`)
      .on('broadcast', { event: 'swap_requested' }, (payload) => {
        console.log('📩 New swap request received:', payload);
        fetchIncomingRequests();
        addToast('New swap request received!', 'info');
      })
      .on('broadcast', { event: 'swap_cancelled' }, (payload) => {
        console.log('🚫 Swap request cancelled:', payload);
        fetchIncomingRequests();
        addToast('A swap request was cancelled', 'info');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, userData]);

  const fetchDriverDetails = async () => {
    if (!currentUser) return;

    try {
      const driversSnapshot = await getDocs(collection(db, 'drivers'));

      driversSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.uid === currentUser.uid) {
          setBusId(data.assignedBusId || data.busId || '');
          setRouteId(data.assignedRouteId || data.routeId || '');
        }
      });
    } catch (error) {
      console.error('Error fetching driver details:', error);
    }
  };

  const fetchDrivers = async () => {
    if (!currentUser) return;

    try {
      console.log('🔍 Fetching drivers...');
      const driversSnapshot = await getDocs(collection(db, 'drivers'));
      const driversList: Driver[] = [];

      console.log('📊 Total drivers found:', driversSnapshot.size);
      console.log('👤 Current user UID:', currentUser.uid);

      driversSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('👨‍💼 Driver data:', {
          docId: doc.id,
          uid: data.uid,
          name: data.fullName || data.name,
          isCurrentUser: data.uid === currentUser.uid
        });

        // Exclude current user
        if (data.uid !== currentUser.uid) {
          driversList.push({
            uid: data.uid,
            fullName: data.fullName || data.name || 'Unknown',
            name: data.name || data.fullName || 'Unknown',
            driverId: data.driverId || data.employeeId || 'N/A',
            phoneNumber: data.phoneNumber || 'N/A'
          });
        }
      });

      console.log('✅ Available drivers for swap:', driversList.length);
      setDrivers(driversList);
    } catch (error) {
      console.error('❌ Error fetching drivers:', error);
      addToast('Failed to load drivers', 'error');
    }
  };

  const fetchIncomingRequests = async () => {
    if (!currentUser) return;

    try {
      setIncomingLoading(true);
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/driver-swap/list-requests', {
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setIncomingRequests(data.incoming.filter((r: SwapRequest) => r.status === 'pending'));
      }
    } catch (error) {
      console.error('Error fetching incoming requests:', error);
      addToast('Failed to fetch swap requests', 'error');
    } finally {
      setIncomingLoading(false);
    }
  };

  const setQuickDuration = (hours: number) => {
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 60000); // +5 minutes
    const end = new Date(start.getTime() + hours * 60 * 60000);

    setStartsAt(start.toISOString().slice(0, 16));
    setEndsAt(end.toISOString().slice(0, 16));
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser || !selectedDriver || !endsAt) {
      addToast('Please fill all required fields', 'error');
      return;
    }

    if (!busId || !routeId) {
      addToast('You must be assigned to a bus and route', 'error');
      return;
    }

    try {
      setLoading(true);
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/driver-swap/create-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          idToken,
          busId,
          routeId,
          candidateDriverUid: selectedDriver,
          startsAt: startsAt || new Date().toISOString(),
          endsAt,
          reason: reason || null
        })
      });

      const data = await response.json();

      if (response.ok) {
        addToast('Swap request sent successfully! 🎉', 'success');
        // Reset form
        setSelectedDriver('');
        setStartsAt('');
        setEndsAt('');
        setReason('');
      } else {
        addToast(data.error || 'Failed to create swap request', 'error');
      }
    } catch (error: any) {
      console.error('Error creating swap request:', error);
      addToast('Failed to create swap request', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    if (!currentUser) return;

    try {
      setProcessing(requestId);
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/driver-swap/accept-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ idToken, requestId })
      });

      const data = await response.json();

      if (response.ok) {
        addToast('Swap request accepted! 🎉', 'success');
        fetchIncomingRequests();
      } else {
        addToast(data.error || 'Failed to accept request', 'error');
      }
    } catch (error: any) {
      console.error('Error accepting request:', error);
      addToast('Failed to accept request', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!currentUser) return;

    try {
      setProcessing(requestId);
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/driver-swap/reject-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ idToken, requestId })
      });

      const data = await response.json();

      if (response.ok) {
        addToast('Swap request rejected', 'info');
        fetchIncomingRequests();
      } else {
        addToast(data.error || 'Failed to reject request', 'error');
      }
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      addToast('Failed to reject request', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const formatDuration = (starts: string, ends: string) => {
    const start = new Date(starts);
    const end = new Date(ends);
    const hours = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));

    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20 md:pb-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Request Swap</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Manage driver swap requests and create new ones
              </p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-2 rounded-full">
              <span className="font-semibold">{incomingRequests.length}</span>
              <span className="text-sm ml-1">Pending</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="incoming" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 dark:bg-gray-800">
            <TabsTrigger value="incoming" className="dark:data-[state=active]:bg-gray-700">
              Incoming Requests ({incomingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="create" className="dark:data-[state=active]:bg-gray-700">
              Create Request
            </TabsTrigger>
          </TabsList>

          {/* Incoming Requests Tab */}
          <TabsContent value="incoming" className="space-y-4">
            {incomingLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 dark:text-gray-400 mt-4">Loading requests...</p>
              </div>
            ) : incomingRequests.length === 0 ? (
              <Card className="dark:bg-gray-900 dark:border-gray-800">
                <CardContent className="py-12">
                  <div className="text-center">
                    <CheckCircle className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      No Pending Requests
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      You don't have any incoming swap requests at the moment.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              incomingRequests.map((request) => (
                <Card key={request.id} className="dark:bg-gray-900 dark:border-gray-800 hover:shadow-lg transition-shadow">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b dark:border-gray-700">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <CardTitle className="text-xl text-gray-900 dark:text-white">
                            {request.requester_name}
                          </CardTitle>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <Bus className="h-4 w-4 text-green-600 dark:text-green-400" />
                            Bus {request.bus_id}
                          </div>
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            {formatDuration(request.starts_at, request.ends_at)}
                          </div>
                        </div>
                      </div>
                      <Badge variant="default" className="self-start">
                        Pending
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6 space-y-4">
                    {/* Time Details */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Start Time</p>
                        <p className="text-gray-900 dark:text-white font-semibold">
                          {new Date(request.starts_at).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">End Time</p>
                        <p className="text-gray-900 dark:text-white font-semibold">
                          {new Date(request.ends_at).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Reason */}
                    {request.reason && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-l-4 border-blue-600">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason:</p>
                        <p className="text-gray-900 dark:text-white">{request.reason}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <Button
                        onClick={() => handleAccept(request.id)}
                        disabled={processing === request.id}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                      >
                        {processing === request.id ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                            Processing...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Accept Request
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => handleReject(request.id)}
                        disabled={processing === request.id}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 cursor-pointer"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Create Request Tab */}
          <TabsContent value="create" className="space-y-4">
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                <CardTitle className="text-gray-900 dark:text-white">Create Swap Request</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Request another driver to temporarily take over your route
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6">
                <form onSubmit={handleCreateRequest} className="space-y-6">
                  {/* Select Driver */}
                  <div className="space-y-2">
                    <Label htmlFor="driver" className="text-gray-900 dark:text-white flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Select Driver *
                    </Label>
                    {drivers.length === 0 ? (
                      <div className="space-y-3">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                            <AlertCircle className="h-5 w-5" />
                            <span className="font-medium">No Other Drivers Available</span>
                          </div>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                            There are currently no other drivers in the system to swap with.
                          </p>
                        </div>
                        <div className="text-center py-4">
                          <User className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                          <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Contact your administrator to add more drivers to the system.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                        <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                          <SelectValue placeholder="Choose a driver" />
                        </SelectTrigger>
                        <SelectContent position="popper" side="bottom" align="start">
                          {drivers.map((driver) => (
                            <SelectItem key={driver.uid} value={driver.uid}>
                              {driver.fullName} - {driver.driverId || driver.employeeId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Quick Duration Presets */}
                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-white">Quick Duration</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setQuickDuration(4)}
                        className="cursor-pointer dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        4 Hours
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setQuickDuration(8)}
                        className="cursor-pointer dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        8 Hours
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setQuickDuration(24)}
                        className="cursor-pointer dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        1 Day
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setQuickDuration(72)}
                        className="cursor-pointer dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        3 Days
                      </Button>
                    </div>
                  </div>

                  {/* Start Time */}
                  <div className="space-y-2">
                    <Label htmlFor="startsAt" className="text-gray-900 dark:text-white flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Start Time
                    </Label>
                    <input
                      type="datetime-local"
                      id="startsAt"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Leave empty to start immediately
                    </p>
                  </div>

                  {/* End Time */}
                  <div className="space-y-2">
                    <Label htmlFor="endsAt" className="text-gray-900 dark:text-white flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      End Time *
                    </Label>
                    <input
                      type="datetime-local"
                      id="endsAt"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      min={startsAt || new Date().toISOString().slice(0, 16)}
                      required
                      className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>

                  {/* Reason */}
                  <div className="space-y-2">
                    <Label htmlFor="reason" className="text-gray-900 dark:text-white">
                      Reason (Optional)
                    </Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="E.g., Personal leave, medical appointment, etc."
                      rows={3}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={loading || !selectedDriver || !endsAt || drivers.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                        Sending Request...
                      </>
                    ) : drivers.length === 0 ? (
                      <>
                        <AlertCircle className="mr-2 h-4 w-4" />
                        No Drivers Available
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Send Swap Request
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
