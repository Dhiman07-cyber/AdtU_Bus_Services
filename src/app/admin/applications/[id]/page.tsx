"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/contexts/toast-context';
import {
  Loader2, CheckCircle, XCircle, ArrowLeft, User as UserIcon, Phone,
  Mail, Calendar, CreditCard, FileText, Clock, Bus as BusIcon,
  Copy, Download, Users, Briefcase, Shield, Zap, Hash, Droplets,
  MapPin, UserCheck, CalendarDays, ShieldCheck, AlertTriangle
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Application } from '@/lib/types/application';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SectionCard } from '@/components/application/section-card';
import { StatusBadge } from '@/components/application/status-badge';
import { cn } from '@/lib/utils';
import { downloadFile } from '@/lib/download-utils';
import { PremiumPageLoader } from '@/components/LoadingSpinner';

export default function AdminApplicationDetailPage() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { showToast } = useToast();
  const applicationId = params?.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busData, setBusData] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [yearlyBusFee, setYearlyBusFee] = useState<number>(1200);
  const [driverData, setDriverData] = useState<any>(null);
  const [verifierData, setVerifierData] = useState<any>(null);
  const [routeError, setRouteError] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReceipt = async () => {
    if (!application?.formData?.paymentInfo?.paymentEvidenceUrl) return;

    try {
      setProcessing(true);
      const filename = `${application.formData.fullName.replace(/\s+/g, '_')}_receipt.${application.formData.paymentInfo.paymentEvidenceUrl.split('.').pop()?.split('?')[0] || 'jpg'}`;
      await downloadFile(application.formData.paymentInfo.paymentEvidenceUrl, filename);
      showToast('Receipt downloaded successfully!', 'success');
      setReceiptModalOpen(false);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      showToast('Failed to download receipt', 'error');
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    const fetchBusFee = async () => {
      try {
        const response = await fetch('/api/settings/bus-fees');
        if (response.ok) {
          const data = await response.json();
          setYearlyBusFee(data.amount || 1200);
        }
      } catch (error) {
        console.error('Error fetching bus fee:', error);
      }
    };
    fetchBusFee();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!currentUser || !userData || userData.role !== 'admin') {
        router.push('/login');
        return;
      }
      loadApplication();
    }
  }, [loading, currentUser, userData, router, applicationId]);

  const loadApplication = async () => {
    try {
      const token = await currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/applications/${applicationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setApplication(data.application);

        // Fetch bus, route, and verifier data in parallel
        const promises = [];
        const routeId = data.application.formData?.routeId;
        if (routeId && token) {
          promises.push(fetchBusAndRouteData(routeId, token));
        }

        const verifiedById = data.application.verifiedById || data.application.verifiedBy;
        if (verifiedById && token) {
          promises.push(fetchVerifierData(verifiedById, token));
        }

        await Promise.all(promises);
      } else {
        showToast('Application not found', 'error');
        router.push('/admin/applications');
      }
    } catch (error) {
      console.error('Error loading application:', error);
      showToast('Failed to load application', 'error');
    } finally {
      setLoadingApp(false);
    }
  };

  const fetchBusAndRouteData = async (routeId: string, token: string) => {
    try {
      // Fetch bus and route data in parallel
      const [busResponse, routeResponse] = await Promise.all([
        fetch(`/api/buses?routeId=${routeId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/routes/${routeId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (busResponse.ok) {
        const busResult = await busResponse.json();
        if (busResult.buses && busResult.buses.length > 0) {
          const bus = busResult.buses[0];
          setBusData(bus);

          // Fetch driver data if assignedDriverId or activeDriverId exists
          const driverId = bus.assignedDriverId || bus.activeDriverId;
          if (driverId) {
            await fetchDriverData(driverId, token);
          }
        }
      }

      if (routeResponse.ok) {
        const routeResult = await routeResponse.json();
        setRouteData(routeResult.route);
        setRouteError(false);
      } else {
        console.warn(`Route ${routeId} not found (Status: ${routeResponse.status})`);
        setRouteError(true);
      }
    } catch (error) {
      console.error('Error fetching bus/route data:', error);
      // Determine if this was a route error vs network error
      setRouteError(true);
    }
  };

  const fetchDriverData = async (driverId: string, token: string) => {
    try {
      const driverResponse = await fetch(`/api/drivers/${driverId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (driverResponse.ok) {
        const driverResult = await driverResponse.json();
        setDriverData(driverResult.driver);
      }
    } catch (error) {
      console.error('Error fetching driver data:', error);
    }
  };

  const fetchVerifierData = async (verifiedById: string, token: string) => {
    if (!verifiedById) return;

    // Special handling for system-verified applications (online payments)
    if (verifiedById === 'system_online_payment') {
      setVerifierData({
        name: 'Automated System',
        employeeId: 'ONLINE-PAY',
        role: 'system'
      });
      return;
    }

    try {
      console.log('🔍 Fetching verifier with ID:', verifiedById);
      // Look up in moderators collection
      const verifierResponse = await fetch(`/api/moderators/${verifiedById}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (verifierResponse.ok) {
        const verifierResult = await verifierResponse.json();
        console.log('✅ Verifier API Response:', verifierResult);
        // Moderator API returns the moderator object directly
        setVerifierData(verifierResult);
      } else {
        console.warn('⚠️ Verifier API failed:', verifierResponse.status);
      }
    } catch (error) {
      console.error('❌ Error fetching verifier data:', error);
    }
  };

  const handleApprove = async () => {
    if (!userData) return;

    if (routeError) {
      showToast('Cannot approve: The assigned route does not exist. Please reassign the route first.', 'error');
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          applicationId,
          approverName: `${userData.fullName} ${userData.empId || ''}`,
          approverId: currentUser?.uid,
          notes: 'Application approved by admin'
        })
      });

      if (response.ok) {
        showToast('Application approved successfully', 'success');
        loadApplication();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve application');
      }
    } catch (error: any) {
      console.error('Error approving application:', error);
      showToast(error.message || 'Failed to approve application', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!userData) return;

    setProcessing(true);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          applicationId,
          rejectorName: `${userData.fullName} ${userData.empId || ''}`,
          rejectorId: currentUser?.uid
        })
      });

      if (response.ok) {
        showToast('Application rejected', 'success');
        setRejectDialogOpen(false);
        router.push('/admin/applications');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject application');
      }
    } catch (error: any) {
      console.error('Error rejecting application:', error);
      showToast(error.message || 'Failed to reject application', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading || loadingApp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#020817]">
        <PremiumPageLoader message="Curating Application Details..." />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="mt-15 text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Application not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent mt-10 py-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <Link href="/admin/applications">
            <Button variant="ghost" size="sm" className="gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 rounded-lg transition-all duration-200">
              <ArrowLeft className="h-4 w-4" />
              Back to Applications
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* ONE Single Large Container */}
        <div className="bg-[#12131A] rounded-[20px] shadow-2xl border border-white/5 overflow-hidden">

          {/* SECTION 1 — TOP HERO CARD (KEEP AS IS ✅) */}
          <div className="p-1">
            <Card className="border-none shadow-none !bg-transparent overflow-hidden">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Premium Profile Photo */}
                  <div className="flex justify-center md:justify-start">
                    <div className="relative w-32 h-32">
                      {/* Multi-layered glow effect */}
                      <div className="absolute inset-[-8px] rounded-full bg-gradient-to-tr from-purple-500/30 via-indigo-500/20 to-blue-500/30 blur-xl opacity-60 transition-opacity"></div>
                      <div className="absolute inset-[-2px] rounded-full bg-gradient-to-tr from-purple-400/50 via-indigo-400/40 to-blue-400/50 opacity-70"></div>

                      {/* Glass-morphism container matching the dark theme */}
                      <div className="relative w-full h-full rounded-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border-[3px] border-white/20 p-1 flex items-center justify-center overflow-hidden z-10 shadow-2xl">
                        {application.formData?.profilePhotoUrl ? (
                          <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-white/10">
                            <img
                              src={application.formData.profilePhotoUrl}
                              alt={application.formData?.fullName}
                              className="w-full h-full object-cover rounded-full"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center">
                            <UserIcon className="w-16 h-16 text-gray-500" />
                          </div>
                        )}
                      </div>

                      {/* Verified/Status badge - positioned more centered */}
                      <div className={`absolute bottom-0 right-1 w-9 h-9 rounded-full border-4 border-[#12131A] flex items-center justify-center shadow-xl z-20 ${application.state === 'rejected' ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-emerald-400 to-teal-500'
                        }`}>
                        {application.state === 'rejected' ? <AlertTriangle className="h-5 w-5 text-white" /> : <ShieldCheck className="h-5 w-5 text-white" />}
                      </div>
                    </div>
                  </div>

                  {/* Student Info */}
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <h1 className="text-3xl font-bold text-white tracking-tight">
                        {application.formData?.fullName}
                      </h1>
                      <StatusBadge status={
                        application.state === 'approved' ? 'approved' :
                          application.state === 'rejected' ? 'rejected' :
                            application.state === 'submitted' ? 'submitted' :
                              'pending'
                      } />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-zinc-400 text-[13px] font-medium">
                      <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-md border border-white/5">
                        <Hash className="h-3.5 w-3.5 text-indigo-400" />
                        <span className="font-mono">{application.formData?.enrollmentId}</span>
                        <button
                          onClick={() => copyToClipboard(application.formData?.enrollmentId)}
                          className="text-zinc-500 hover:text-white transition-colors ml-1"
                        >
                          {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-zinc-500" />
                        <a href={`tel:${application.formData?.phoneNumber}`} className="hover:text-indigo-400 transition-colors">
                          {application.formData?.phoneNumber}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-zinc-500" />
                        <a href={`mailto:${application.email || application.formData?.email}`} className="hover:text-indigo-400 transition-colors">
                          {(() => {
                            const email = application.email || application.formData?.email;
                            return (typeof email === 'string' && email.includes('@')) ? email : '—';
                          })()}
                        </a>
                      </div>
                    </div>

                    {/* Chips */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 px-3 py-1 font-medium">
                        <Briefcase className="h-3 w-3 mr-2" />
                        {application.formData?.department}
                      </Badge>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 px-3 py-1 font-medium">
                        <Calendar className="h-3 w-3 mr-2" />
                        Semester {application.formData?.semester}
                      </Badge>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/20 px-3 py-1 font-medium capitalize">
                        <Clock className="h-3 w-3 mr-2" />
                        {application.formData?.shift || 'Flexible'} Shift
                      </Badge>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {application.state === 'submitted' && (
                    <div className="flex flex-row md:flex-col gap-3 w-full md:w-auto self-center md:self-center mt-4 md:mt-0">
                      {(application as any).needsCapacityReview ? (
                        // Application needs capacity review - redirect to smart allocation
                        <>
                          <div className="flex flex-col gap-2">
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1.5 self-start">
                              <AlertTriangle className="h-3 w-3" />
                              Needs Seat Assignment
                            </Badge>
                            <p className="text-xs text-zinc-400 md:max-w-[200px]">
                              This student applied for a full bus. Please assign a seat via Smart Allocation.
                            </p>
                          </div>
                          <Button
                            onClick={() => router.push('/admin/smart-allocation')}
                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-xl shadow-amber-900/10 gap-2 h-11 px-6 w-full md:min-w-[120px]"
                          >
                            <AlertTriangle className="h-4 w-4" />
                            Assign Seat
                          </Button>
                        </>
                      ) : (
                        // Normal approval flow
                        <Button
                          onClick={handleApprove}
                          disabled={processing}
                          className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-900/10 gap-2 h-11 px-6 md:min-w-[120px]"
                        >
                          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          Approve
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={() => setRejectDialogOpen(true)}
                        disabled={processing}
                        className="flex-1 md:flex-none bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 gap-2 h-11 px-6"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="h-px bg-white/[0.08]" />

          {/* SECTION 2 — INFORMATION GRID (REDESIGNED WITH UNIFIED LAYOUT) */}
          {/* SECTION 2 — INFORMATION GRID (REDESIGNED WITH UNIFIED LAYOUT) */}
          <div className="p-10">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-10">

              {/* Column 1: Personal Information */}
              <div className="flex flex-col gap-8">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <div className="h-5 w-1 bg-indigo-500 rounded-full"></div>
                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Personal Information</h3>
                </div>

                {/* Content */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  <InfoRow label="Full Name" value={application.formData?.fullName} />
                  <InfoRow label="Enrollment ID" value={application.formData?.enrollmentId} isMono />
                  <InfoRow label="Email" value={(() => {
                    const email = application.email || application.formData?.email;
                    return (typeof email === 'string' && email.includes('@')) ? email : null;
                  })()} />
                  <InfoRow label="Phone" value={application.formData?.phoneNumber} />
                  <InfoRow label="DOB" value={application.formData?.dob} />
                  <InfoRow label="Blood Group" value={application.formData?.bloodGroup} />
                  <InfoRow label="Parent/Guardian" value={application.formData?.parentName} />
                  <InfoRow label="Emergency Contact" value={application.formData?.parentPhone} />
                </div>
              </div>

              {/* Responsive Divider (Horizontal on Mobile, Vertical on Desktop) */}
              <div className="h-px w-full md:h-auto md:w-px bg-white/[0.06]"></div>

              {/* Column 2: Service Configuration */}
              <div className="flex flex-col gap-8">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <div className="h-5 w-1 bg-emerald-500 rounded-full"></div>
                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Service Configuration</h3>
                </div>

                {/* Content */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.08em]">Route Assignment</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#F4F4F5]">
                        {application.formData?.routeId ? `Route ${application.formData.routeId.replace('route_', '')}` : 'Not Assigned'}
                      </span>
                      {routeError && (
                        <Badge variant="destructive" className="h-5 text-[10px] px-1.5 py-0">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Missing
                        </Badge>
                      )}
                    </div>
                  </div>
                  <InfoRow label="Bus Number" value={busData?.busNumber || 'PENDING'} isMono />
                  <InfoRow label="Operating Shift" value={application.formData?.shift || 'Flexible'} />
                  <InfoRow label="Valid Until" value={(() => {
                    const startYear = application.formData?.sessionInfo?.sessionStartYear || new Date().getFullYear();
                    const duration = application.formData?.sessionInfo?.durationYears || 1;
                    return `31 July ${startYear + duration}`;
                  })()} />
                  <InfoRow
                    label="Assigned Pilot / Driver"
                    value={driverData?.name || driverData?.fullName || busData?.driverName || 'Allocating Pilot...'}
                  />
                  <InfoRow
                    label="Bus Stop"
                    value={(() => {
                      const stopId = application.formData?.stopId;
                      if (!stopId) return '—';
                      let stopName = stopId;
                      if (routeData?.stops) {
                        const stop = routeData.stops.find((s: any) => s.id === stopId || s.stopId === stopId);
                        stopName = stop ? stop.name || stop.stopName || stopId : stopId;
                      }
                      return stopName.charAt(0).toUpperCase() + stopName.slice(1);
                    })()}
                  />
                </div>
              </div>

            </div>
          </div>

          <div className="h-px bg-white/[0.08]" />

          {/* SECTION 3 — PAYMENT INFORMATION (SIMPLIFIED) */}
          <div className="p-10">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-5 w-1 bg-amber-500 rounded-full"></div>
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Payment Information</h3>
            </div>

            {/* Payment Strip */}
            <div className="flex flex-wrap items-center gap-y-8 gap-x-12 py-7 px-10 rounded-[18px] bg-white/[0.02] border border-white/[0.05] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                <CreditCard className="h-20 w-20 text-white" />
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[140px]">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.1em]">Amount Collected</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">₹{application.formData?.paymentInfo?.amountPaid?.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Paid</span>
                </div>
              </div>

              <div className="hidden md:block w-[2px] h-10 bg-white/10" />

              <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[100px]">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.1em]">Payment Mode</span>
                <span className="text-sm font-bold text-zinc-100 capitalize">{application.formData?.paymentInfo?.paymentMode}</span>
              </div>

              <div className="hidden md:block w-[2px] h-10 bg-white/10" />

              <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[100px]">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.1em]">Subscription</span>
                <span className="text-sm font-bold text-zinc-100">{application.formData?.sessionInfo?.durationYears || 1} Year Plan</span>
              </div>

              <div className="hidden md:block w-[2px] h-10 bg-white/10" />

              <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[120px]">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.1em]">Gateway Status</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-sm font-bold text-emerald-400 uppercase tracking-tight">Active / Success</span>
                </div>
              </div>

              {application.formData?.paymentInfo?.paymentEvidenceUrl && application.formData?.paymentInfo?.paymentMode !== 'online' && (
                <div className="ml-auto w-full sm:w-auto mt-4 sm:mt-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full sm:w-auto gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[11px] font-bold uppercase tracking-wider"
                    onClick={() => setReceiptModalOpen(true)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Inspect Receipt
                  </Button>
                </div>
              )}
            </div>

            {/* Sub-strip for metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6 px-4">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Transaction / Reference ID</span>
                <span className="text-xs font-mono text-zinc-400 truncate tracking-tight" title={application.formData?.paymentInfo?.razorpayPaymentId || application.formData?.paymentInfo?.paymentReference || 'N/A'}>
                  {application.formData?.paymentInfo?.razorpayPaymentId || application.formData?.paymentInfo?.paymentReference || 'N/A'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Payment made on</span>
                <span className="text-xs text-zinc-400">
                  {application.formData?.paymentInfo?.paymentTime
                    ? new Date(application.formData.paymentInfo.paymentTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                    : 'N/A'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Verified by</span>
                <span className="text-xs text-zinc-400 font-medium">
                  {application.formData?.paymentInfo?.paymentMode === 'online' ? 'Automated System (ONLINE-PAY)' : 'Manual Auditor Queue'}
                </span>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/[0.08]" />

          {/* SECTION 4 — VERIFICATION CONTEXT (FULL-WIDTH 3-COLUMN GRID) */}
          <div className="p-10 pb-16">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-5 w-1 bg-blue-500 rounded-full"></div>
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Verification Context</h3>
            </div>

            {/* Full-width equalized 3-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Status Column - SQUARED BOX DESIGN */}
              <div className="flex flex-row items-center gap-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                    <CheckCircle className="h-3 w-3" />
                    Verified
                  </div>
                  <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight">Security Cleared</p>
                </div>
              </div>

              {/* Authenticator Column */}
              <div className="flex flex-col gap-1 justify-center">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Authenticator</span>
                <p className="text-xs text-zinc-300 font-medium">
                  {verifierData?.name && verifierData?.employeeId
                    ? `${verifierData.name} (${verifierData.employeeId})`
                    : verifierData?.name || 'Automated System (SECURE)'
                  }
                </p>
              </div>

              {/* Submitted On Column */}
              <div className="flex flex-col gap-1 justify-center">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Submitted on</span>
                <p className="text-xs text-zinc-400 font-mono">
                  {(application as any).submittedAt
                    ? new Date((application as any).submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                    : (application.formData?.paymentInfo?.paymentTime
                      ? new Date(application.formData.paymentInfo.paymentTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Real-time')}
                </p>
              </div>
            </div>


          </div>
        </div>

        {/* Receipt Modal */}
        {application.formData?.paymentInfo?.paymentEvidenceUrl && (
          <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
            <DialogContent className="max-w-3xl w-full p-0 gap-0 bg-[#0E0F12] border border-white/10 text-white overflow-hidden shadow-2xl sm:rounded-2xl top-[5%] translate-y-0 data-[state=open]:slide-in-from-top-[5%] mt-7">
              <div className="flex flex-col h-full max-h-[85vh]">
                {/* Header */}
                <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-white/[0.03] to-transparent border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-400" />
                        Payment Receipt
                      </DialogTitle>
                      <DialogDescription className="text-zinc-400 text-xs">
                        Reference ID: <span className="font-mono text-zinc-300">{application.formData.paymentInfo.paymentReference || 'N/A'}</span>
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {/* Content - Scrollable Image Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-black/40 min-h-[300px] flex items-center justify-center relative">
                  {/* Checkerboard background for transparency */}
                  <div className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
                      backgroundSize: '20px 20px'
                    }}
                  />

                  <div className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-[#0E0F12]">
                    <Image
                      src={application.formData.paymentInfo.paymentEvidenceUrl}
                      alt="Payment receipt"
                      width={800}
                      height={1000}
                      className="w-full h-auto max-h-[60vh] object-contain"
                      unoptimized // Important for external URLs to render correctly without optimization issues
                    />
                  </div>
                </div>

                {/* Footer */}
                <DialogFooter className="p-6 pt-4 bg-[#0E0F12] border-t border-white/5 flex flex-row items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500 font-mono hidden sm:block">
                    {application.formData.fullName} • {application.formData.enrollmentId}
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    <Button
                      variant="ghost"
                      onClick={() => setReceiptModalOpen(false)}
                      className="text-zinc-400 hover:text-white hover:bg-white/5"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={handleDownloadReceipt}
                      disabled={processing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/20"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                      Download Receipt
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="max-w-md bg-[#0E0F12] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Reject Application</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Are you sure you want to reject this application? This action will permanently remove the application and all associated data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6">
              <Button
                variant="ghost"
                onClick={() => setRejectDialogOpen(false)}
                disabled={processing}
                className="text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing}
                className="gap-2 bg-red-600 hover:bg-red-700 text-white border-none"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Helper components
function InfoRow({ label, value, isMono = false }: { label: string; value: string | undefined | null; isMono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-medium text-[#71717A] uppercase tracking-[0.08em]">{label}</span>
      <span
        className={cn(
          "text-[14px] font-medium text-[#F4F4F5] truncate leading-tight",
          isMono && "font-mono tracking-tight"
        )}
        title={value || '—'}
      >
        {value || '—'}
      </span>
    </div>
  );
}
