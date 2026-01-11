"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  IndianRupee,
  Info,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Receipt,
  History,
  Eye,
  FileText,
  User,
  XCircle,
  Download,
  Filter,
  Search,
  UserPlus,
  Trash2,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseFirestoreDate, formatDate } from '@/lib/utils/date-utils';
import Avatar from '@/components/Avatar';
import { PaymentDetailModal } from '@/components/payment';

interface StudentData {
  fullName: string;
  email: string;
  phoneNumber: string;
  alternatePhone?: string;
  enrollmentId: string;
  faculty: string;
  course: string;
  semester: string;
  gender: string;
  busAssigned: string;
  busId?: string;
  shift: string;
  sessionStartYear: number;
  sessionEndYear: number;
  profilePhotoUrl?: string;
  status: string;
  address?: string;
  emergencyContact?: string;
}

interface RenewalRequest {
  id: string;
  studentId: string;
  studentName: string;
  enrollmentId: string;
  studentEmail?: string;
  durationYears: number;
  totalFee: number;
  transactionId?: string;
  receiptImageUrl?: string;
  paymentMode: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;
  approvedBy?: string;
  approvedAt?: any;
  rejectedBy?: string;
  rejectedAt?: any;
  studentData?: StudentData;
}

interface Transaction {
  studentId: string;
  studentName: string;
  amount: number;
  paymentMethod: 'online' | 'offline' | 'manual';
  paymentId: string;
  timestamp: string;
  durationYears: number;
  validUntil: string;
  approvedBy?: string;
  status?: 'completed' | 'pending' | 'failed';
}

interface EnrichedTransaction extends Transaction {
  profilePhotoUrl: string;
  userId?: string; // Firestore document ID
}

interface StudentSearchResult {
  id: string;
  fullName: string;
  email: string;
  enrollmentId: string;
  phoneNumber: string;
  alternatePhone: string;
  faculty: string;
  busId: string;
  shift: string;
  status: string;
  validUntil: string;
  sessionStartYear: number;
  sessionEndYear: number;
  profilePhotoUrl?: string; // Keep for manual renewal search
  duration?: number; // Individual renewal duration
}

export default function AdminRenewalServicePage() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('renewal');
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RenewalRequest | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Transaction history states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [enrichedTransactions, setEnrichedTransactions] = useState<EnrichedTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all');

  // Manual renewal states
  const [searchQuery, setSearchQuery] = useState('');
  const [allStudents, setAllStudents] = useState<StudentSearchResult[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentSearchResult[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<StudentSearchResult[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [baseFee, setBaseFee] = useState<number>(1200); // Per year fee from settings
  const [buses, setBuses] = useState<any[]>([]);

  // Payment detail modal states
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [showPaymentDetailModal, setShowPaymentDetailModal] = useState(false);

  // Handler for clicking on manual payment badge
  const handleManualPaymentClick = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setShowPaymentDetailModal(true);
  };

  // Check admin access
  useEffect(() => {
    if (!loading && userData && userData.role !== 'admin' && userData.role !== 'moderator') {
      router.push(`/${userData.role}`);
    }
  }, [userData, loading, router]);

  // Fetch renewal requests with student data
  useEffect(() => {
    const fetchRenewalRequests = async () => {
      if (!currentUser || activeTab !== 'approval') return;

      try {
        setLoadingRequests(true);
        const renewalRef = collection(db, 'renewal_requests');
        const q = query(renewalRef, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        const requests: RenewalRequest[] = [];
        snapshot.forEach((doc) => {
          requests.push({ id: doc.id, ...doc.data() } as RenewalRequest);
        });

        // Fetch student data for each request
        const requestsWithStudentData = await Promise.all(
          requests.map(async (request) => {
            try {
              const studentDoc = await getDocs(
                query(collection(db, 'students'), where('enrollmentId', '==', request.enrollmentId), limit(1))
              );
              if (!studentDoc.empty) {
                const studentData = studentDoc.docs[0].data() as StudentData;
                return { ...request, studentData };
              }
              return request;
            } catch (error) {
              console.error(`Error fetching student data for ${request.enrollmentId}:`, error);
              return request;
            }
          })
        );

        setRenewalRequests(requestsWithStudentData);
      } catch (error) {
        console.error('Error fetching renewal requests:', error);
        toast.error('Failed to load renewal requests');
      } finally {
        setLoadingRequests(false);
      }
    };

    fetchRenewalRequests();
  }, [currentUser, activeTab]);

  // Fetch transaction history
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!currentUser || activeTab !== 'history') return;

      setLoadingTransactions(true);
      try {
        const token = await currentUser.getIdToken();
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '20',
          year: filterYear,
          ...(filterStudentId && { studentId: filterStudentId }),
          ...(filterPaymentMethod !== 'all' && { paymentMethod: filterPaymentMethod })
        });

        const response = await fetch(`/api/payment/transactions?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const rawTransactions = data.transactions || [];
          setTransactions(rawTransactions);
          setTotalPages(data.totalPages || 1);

          // Enrich transactions with student data (userId only)
          const enriched = await Promise.all(
            rawTransactions.map(async (transaction: any) => {
              try {
                const studentsRef = collection(db, 'students');
                const q = query(studentsRef, where('enrollmentId', '==', transaction.studentId), limit(1));
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                  const studentDoc = snapshot.docs[0];
                  // We only need the ID for navigation
                  return {
                    ...transaction,
                    userId: studentDoc.id
                  };
                }
                return transaction;
              } catch (error) {
                console.error(`Error fetching student data for ${transaction.studentId}:`, error);
                return transaction;
              }
            })
          );
          setEnrichedTransactions(enriched);
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
        toast.error('Failed to load transaction history');
      } finally {
        setLoadingTransactions(false);
      }
    };

    fetchTransactions();
  }, [currentUser, activeTab, currentPage, filterYear, filterStudentId, filterPaymentMethod]);

  // Fetch buses data
  useEffect(() => {
    const fetchBuses = async () => {
      if (!currentUser) return;

      try {
        const busesRef = collection(db, 'buses');
        const snapshot = await getDocs(busesRef);
        const busesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBuses(busesData);
      } catch (error) {
        console.error('Error fetching buses:', error);
      }
    };

    fetchBuses();
  }, [currentUser]);

  // Fetch bus fee from settings via API
  useEffect(() => {
    const fetchBusFee = async () => {
      try {
        const response = await fetch('/api/settings/bus-fees');
        if (response.ok) {
          const data = await response.json();
          setBaseFee(data.fees || data.amount || 1200);
        } else {
          console.warn('Failed to fetch bus fees, using fallback');
          setBaseFee(1200); // Fallback
        }
      } catch (error) {
        console.error('Error fetching bus fee:', error);
        setBaseFee(1200); // Fallback
      }
    };

    fetchBusFee();
  }, []);

  // Load all students on tab change to 'renewal'
  useEffect(() => {
    const loadAllStudents = async () => {
      if (!currentUser || activeTab !== 'renewal' || allStudents.length > 0) return;

      setLoadingStudents(true);
      try {
        const studentsRef = collection(db, 'students');
        const q = query(studentsRef, limit(500)); // Load up to 500 students
        const snapshot = await getDocs(q);

        const students: StudentSearchResult[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const validUntilDate = parseFirestoreDate(data.validUntil);
          students.push({
            id: doc.id,
            fullName: data.fullName || '',
            email: data.email || '',
            enrollmentId: data.enrollmentId || '',
            phoneNumber: data.phoneNumber || '',
            alternatePhone: data.alternatePhone || '',
            faculty: data.faculty || '',
            busId: data.busId || 'Not Assigned',
            shift: data.shift || '',
            status: data.status || 'active',
            validUntil: validUntilDate ? validUntilDate.toISOString() : '',
            sessionStartYear: data.sessionStartYear || 0,
            sessionEndYear: data.sessionEndYear || 0,
            profilePhotoUrl: data.profilePhotoUrl || ''
          });
        });

        setAllStudents(students);
        // Don't set filteredStudents - keep it empty until user types
      } catch (error) {
        console.error('Error loading students:', error);
        toast.error('Failed to load students');
      } finally {
        setLoadingStudents(false);
      }
    };

    loadAllStudents();
  }, [activeTab, allStudents.length]);

  // Auto-filter students based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStudents([]); // Show nothing when search is empty
      return;
    }

    const searchTerm = searchQuery.toLowerCase();
    const filtered = allStudents.filter(student =>
      student.enrollmentId.toLowerCase().includes(searchTerm) ||
      student.fullName.toLowerCase().includes(searchTerm)
    );
    setFilteredStudents(filtered);
  }, [searchQuery, allStudents]);

  // Helper function to format bus display with busNumber
  const getBusDisplay = (busId: string): string => {
    if (!busId || busId === 'Not Assigned') return 'Not Assigned';

    // Extract bus number from busId
    const extractNumber = (str: string): string => {
      const match = str.match(/\d+/);
      return match ? match[0] : '';
    };

    const busNum = extractNumber(busId);

    // Find the bus in the buses array
    const bus = buses.find(b =>
      b.id === busId ||
      b.busId === busId ||
      extractNumber(b.id || '') === busNum ||
      extractNumber(b.busId || '') === busNum
    );

    if (bus && bus.busNumber) {
      return `Bus-${busNum} (${bus.busNumber})`;
    }

    return `Bus-${busNum}`;
  };

  const handleSelectStudent = (student: StudentSearchResult) => {
    if (selectedStudents.find(s => s.id === student.id)) {
      toast.info('Student already selected');
      return;
    }
    // Add student with default duration of 1 year
    setSelectedStudents([...selectedStudents, { ...student, duration: 1 }]);
    setSearchQuery('');
    setComboboxOpen(false);
  };

  const handleDurationChange = (studentId: string, duration: number) => {
    setSelectedStudents(selectedStudents.map(s =>
      s.id === studentId ? { ...s, duration } : s
    ));
  };

  const handleRemoveStudent = (studentId: string) => {
    setSelectedStudents(selectedStudents.filter(s => s.id !== studentId));
  };

  const handleConfirmRenewal = async () => {
    if (selectedStudents.length === 0) {
      toast.error('Please select at least one student');
      return;
    }

    setIsRenewing(true);
    try {
      const token = await currentUser!.getIdToken();

      // Process each student with their individual duration
      const renewalPromises = selectedStudents.map(async (student) => {
        const response = await fetch('/api/renewal-requests/manual-renew', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            studentIds: [student.id],
            durationYears: student.duration || 1,
            adminName: userData?.name || 'Admin'
          })
        });
        return response;
      });

      const results = await Promise.all(renewalPromises);
      const successCount = results.filter(r => r.ok).length;

      if (successCount > 0) {
        toast.success(`Successfully renewed ${successCount} student(s)`);
        setSelectedStudents([]);
        setSearchQuery('');
      } else {
        toast.error('Failed to renew students');
      }
    } catch (error) {
      console.error('Error renewing students:', error);
      toast.error('Failed to renew students');
    } finally {
      setIsRenewing(false);
    }
  };

  const handleApproveRequest = async () => {
    if (!selectedRequest || !currentUser) return;

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/renewal-requests/approve-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: selectedRequest.id
        })
      });

      if (response.ok) {
        toast.success('Renewal request approved successfully');
        setShowViewDialog(false);
        setSelectedRequest(null);
        // Refresh the list
        setActiveTab('approval');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to approve renewal request');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      toast.error('Failed to approve renewal request');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedRequest || !currentUser || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/renewal-requests/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          rejectionReason: rejectionReason.trim()
        })
      });

      if (response.ok) {
        toast.success('Renewal request rejected');
        setShowRejectDialog(false);
        setSelectedRequest(null);
        setRejectionReason('');
        // Refresh the list
        setActiveTab('approval');
      } else {
        toast.error('Failed to reject renewal request');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error('Failed to reject renewal request');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadReceipt = async (paymentId: string) => {
    const loadingToastId = toast.loading('Preparing receipt...');
    try {
      if (!currentUser) {
        toast.dismiss(loadingToastId);
        toast.error('Authentication required');
        return;
      }

      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/payment/receipt/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to generate receipt');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt_${paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.dismiss(loadingToastId);
      toast.success('Receipt downloaded successfully');
    } catch (error) {
      console.error('Error downloading receipt:', error);
      toast.dismiss(loadingToastId);
      toast.error('Failed to download receipt');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#010717] p-4">
      <div className="max-w-7xl mx-auto py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <RefreshCw className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Renewal Management
            </h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage student renewal requests and view payment history
          </p>
        </div>

        {/* Tabs - Custom Gradient Tabs */}
        <div className="mb-4">
          <div className="flex gap-2 border-b border-gray-700/30 px-4">
            <button
              onClick={() => setActiveTab('renewal')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-t-lg font-semibold text-xs transition-all border-b-2 ${activeTab === 'renewal'
                ? 'bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 text-white shadow-md shadow-purple-500/30 border-purple-500'
                : 'bg-transparent text-gray-400 hover:text-gray-200 border-transparent hover:bg-gray-800/30'
                }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Renewal Service
            </button>
            <button
              onClick={() => setActiveTab('approval')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-t-lg font-semibold text-xs transition-all border-b-2 ${activeTab === 'approval'
                ? 'bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 text-white shadow-md shadow-purple-500/30 border-purple-500'
                : 'bg-transparent text-gray-400 hover:text-gray-200 border-transparent hover:bg-gray-800/30'
                }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Payment Approval
              {renewalRequests.length > 0 && (
                <Badge className="ml-1.5 bg-yellow-500 text-white text-[10px] px-1.5 py-0">
                  {renewalRequests.length}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-t-lg font-semibold text-xs transition-all border-b-2 ${activeTab === 'history'
                ? 'bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 text-white shadow-md shadow-purple-500/30 border-purple-500'
                : 'bg-transparent text-gray-400 hover:text-gray-200 border-transparent hover:bg-gray-800/30'
                }`}
            >
              <History className="h-3.5 w-3.5" />
              Transaction History
            </button>
          </div>
        </div>

        <Tabs defaultValue="renewal" value={activeTab} onValueChange={setActiveTab}>
          <div className="hidden">
            <TabsList>
              <TabsTrigger value="renewal">Renewal</TabsTrigger>
              <TabsTrigger value="approval">Approval</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>

          {/* Renewal Service Tab */}
          <TabsContent value="renewal" className="mt-0 px-0 py-4">
            <Card className="border border-zinc-800/50 shadow-xl bg-zinc-900/50 backdrop-blur-sm overflow-hidden p-0 w-full min-h-[600px] max-h-[900px] flex flex-col">
              <CardHeader className="bg-gradient-to-br from-purple-950/40 via-indigo-950/40 to-blue-950/40 border-t border-t-purple-500/50 pb-3 pt-3 m-0 rounded-t-lg">
                <div>
                  <CardTitle className="text-base text-gray-100 font-semibold">Manual Renewal Service</CardTitle>
                  <CardDescription className="text-xs text-gray-400 mt-0.5">
                    Search and renew students manually without payment processing
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-3 px-4 pb-4 flex-1 overflow-y-auto">
                {/* Search Section - Auto-filtering Dropdown */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-300 mb-1.5 block font-medium">Search & Select Students</Label>
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={comboboxOpen}
                          className="w-full justify-center h-8 bg-zinc-800/60 text-gray-300 border-zinc-700/50 hover:bg-zinc-800 hover:border-purple-500/50 transition-all text-xs"
                        >
                          {loadingStudents ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Loading students...
                            </>
                          ) : (
                            <>
                              <Search className="mr-1.5 h-3.5 w-3.5" />
                              Search by Enrollment ID or Name...
                            </>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 bg-zinc-950 dark:bg-zinc-950 border-zinc-700 dark:border-zinc-700" align="start" side="bottom" sideOffset={4} avoidCollisions={false} style={{ width: 'var(--radix-popover-trigger-width)' }}>
                        <Command className="bg-zinc-950 dark:bg-zinc-950">
                          <CommandInput
                            placeholder="Type enrollment ID or name..."
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                            className="bg-zinc-950 dark:bg-zinc-950 text-gray-100 dark:text-gray-100 border-zinc-800 h-8 text-xs"
                          />
                          <CommandList className="max-h-[350px]">
                            <CommandEmpty className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                              {searchQuery.trim() ? 'No students found.' : 'Type to search students...'}
                            </CommandEmpty>

                            {/* Column Headers */}
                            {searchQuery.trim() && filteredStudents.length > 0 && (
                              <div className="sticky top-0 z-10 bg-zinc-900 dark:bg-zinc-900 border-b border-zinc-600 dark:border-zinc-600 px-2 py-1.5">
                                <div className="flex items-center gap-2 w-full text-[10px] font-semibold text-gray-200">
                                  <div className="w-8 flex-shrink-0"></div> {/* Photo column */}
                                  <div className="flex-1 grid grid-cols-12 gap-2">
                                    <div className="col-span-2">Student</div>
                                    <div className="col-span-2 ml-2">Enrollment ID</div>
                                    <div className="col-span-3 ml-4">Faculty</div>
                                    <div className="col-span-2 ml-1">Bus Assigned</div>
                                    <div className="col-span-1">Shift</div>
                                    <div className="col-span-1">Session</div>
                                    <div className="col-span-1">Status</div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <CommandGroup className="bg-zinc-950 dark:bg-zinc-950">
                              {searchQuery.trim() && filteredStudents.slice(0, 10).map((student) => {
                                const isAlreadySelected = selectedStudents.find(s => s.id === student.id);
                                return (
                                  <CommandItem
                                    key={student.id}
                                    value={`${student.enrollmentId} ${student.fullName}`}
                                    onSelect={() => handleSelectStudent(student)}
                                    className="cursor-pointer text-gray-100 hover:bg-zinc-800 px-2 py-2 border-b border-zinc-800"
                                    disabled={!!isAlreadySelected}
                                  >
                                    <div className="flex items-center gap-2 w-full text-[10px]">
                                      {/* Profile Photo - Circular */}
                                      <Avatar
                                        src={student.profilePhotoUrl}
                                        name={student.fullName}
                                        size="sm"
                                      />

                                      {/* Student Info Grid - 12 columns with proper spacing */}
                                      <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                        {/* Student Name & Email - More space for longer content */}
                                        <div className="col-span-2">
                                          <p className="font-semibold text-[11px] text-gray-100 leading-tight truncate">{student.fullName}</p>
                                          <p className="text-[9px] text-gray-400 mt-0.5 truncate">{student.email}</p>
                                        </div>

                                        {/* Enrollment ID - More space to be fully visible */}
                                        <div className="col-span-2">
                                          <p className="text-[10px] font-mono text-gray-300 truncate ml-2">{student.enrollmentId}</p>
                                        </div>

                                        {/* Faculty - More space for long faculty names */}
                                        <div className="col-span-3">
                                          <p className="text-[10px] text-gray-300 leading-relaxed line-clamp-2 ml-4">{student.faculty}</p>
                                        </div>

                                        {/* Bus Assigned - More space for better visibility */}
                                        <div className="col-span-2">
                                          <p className="text-[10px] text-gray-300 font-medium truncate ml-1">{getBusDisplay(student.busId)}</p>
                                        </div>

                                        {/* Shift - Compact column */}
                                        <div className="col-span-1">
                                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 whitespace-nowrap h-4">
                                            {student.shift || 'N/A'}
                                          </Badge>
                                        </div>

                                        {/* Session - Compact column */}
                                        <div className="col-span-1">
                                          <Badge variant={isAlreadySelected ? "secondary" : "default"} className="text-[9px] px-1 py-0 whitespace-nowrap h-4">
                                            {student.sessionStartYear}-{student.sessionEndYear}
                                          </Badge>
                                        </div>

                                        {/* Status - Compact column */}
                                        <div className="col-span-1 flex items-center gap-0.5">
                                          <Badge
                                            className={`text-[9px] px-1.5 py-0 font-medium border-0 whitespace-nowrap h-4 ${student.status?.toLowerCase() === 'active'
                                              ? 'bg-green-600 hover:bg-green-700 text-white'
                                              : 'bg-gray-600 hover:bg-gray-700 text-white'
                                              }`}
                                          >
                                            {student.status?.toLowerCase() === 'active' ? 'Active' : (student.status ? student.status.charAt(0).toUpperCase() + student.status.slice(1).toLowerCase() : 'Inactive')}
                                          </Badge>
                                          {isAlreadySelected && (
                                            <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {searchQuery.trim() && filteredStudents.length > 0 && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        {filteredStudents.length} student(s) found • Click to select
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick Guide - Only show when no students selected */}
                {selectedStudents.length === 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="mb-3">
                      <h5 className="text-sm font-semibold text-gray-200">Quick Guide</h5>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Step 1 */}
                      <div className="group relative bg-zinc-800/30 backdrop-blur-sm border border-purple-800/20 rounded-lg p-3 hover:border-purple-600/40 transition-all">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-purple-500/20">
                            1
                          </div>
                          <div className="flex-1">
                            <h6 className="text-xs font-semibold text-gray-200 mb-1">Search Students</h6>
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                              Type enrollment ID or name in the search box to find students
                            </p>
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Search className="h-3 w-3 text-purple-400" />
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="group relative bg-zinc-800/30 backdrop-blur-sm border border-blue-800/20 rounded-lg p-3 hover:border-blue-600/40 transition-all">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/20">
                            2
                          </div>
                          <div className="flex-1">
                            <h6 className="text-xs font-semibold text-gray-200 mb-1">Select & Configure</h6>
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                              Click to select students and set renewal duration (1-4 years)
                            </p>
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <UserPlus className="h-3 w-3 text-blue-400" />
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="group relative bg-zinc-800/30 backdrop-blur-sm border border-indigo-800/20 rounded-lg p-3 hover:border-indigo-600/40 transition-all">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/20">
                            3
                          </div>
                          <div className="flex-1">
                            <h6 className="text-xs font-semibold text-gray-200 mb-1">Confirm Renewal</h6>
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                              Review selections and click confirm to process renewals
                            </p>
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <CheckCircle className="h-3 w-3 text-indigo-400" />
                        </div>
                      </div>
                    </div>

                    {/* All Students List */}
                    <div className="mt-4">
                      <div className="mb-2">
                        <h5 className="text-sm font-semibold text-gray-200">All Students ({allStudents.length})</h5>
                      </div>

                      {loadingStudents ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                        </div>
                      ) : allStudents.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-500">
                          No students found
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                          {/* Column Headers */}
                          <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-700 px-2 py-1.5 mb-1">
                            <div className="flex items-center gap-2 w-full text-[10px] font-semibold text-gray-300">
                              <div className="w-8 flex-shrink-0"></div>
                              <div className="flex-1 grid grid-cols-12 gap-2">
                                <div className="col-span-2">Student</div>
                                <div className="col-span-2 ml-2">Enrollment ID</div>
                                <div className="col-span-3 ml-4">Faculty</div>
                                <div className="col-span-2 ml-1">Bus Assigned</div>
                                <div className="col-span-1">Shift</div>
                                <div className="col-span-1">Session</div>
                                <div className="col-span-1">Status</div>
                              </div>
                            </div>
                          </div>

                          {allStudents.map((student) => {
                            const isAlreadySelected = selectedStudents.find(s => s.id === student.id);
                            return (
                              <div
                                key={student.id}
                                onClick={() => handleSelectStudent(student)}
                                className={`cursor-pointer hover:bg-zinc-800/60 px-2 py-2 border-b border-zinc-800/50 transition-colors rounded ${isAlreadySelected ? 'bg-zinc-800/40 border-purple-800/30' : ''
                                  }`}
                              >
                                <div className="flex items-center gap-2 w-full text-[10px]">
                                  <Avatar
                                    src={student.profilePhotoUrl}
                                    name={student.fullName}
                                    size="sm"
                                  />

                                  <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-2">
                                      <p className="font-semibold text-[11px] text-gray-100 leading-tight truncate">{student.fullName}</p>
                                      <p className="text-[9px] text-gray-400 mt-0.5 truncate">{student.email}</p>
                                    </div>

                                    <div className="col-span-2">
                                      <p className="text-[10px] font-mono text-gray-300 truncate ml-2">{student.enrollmentId}</p>
                                    </div>

                                    <div className="col-span-3">
                                      <p className="text-[10px] text-gray-300 leading-relaxed line-clamp-2 ml-4">{student.faculty}</p>
                                    </div>

                                    <div className="col-span-2">
                                      <p className="text-[10px] text-gray-300 font-medium truncate ml-1">{getBusDisplay(student.busId)}</p>
                                    </div>

                                    <div className="col-span-1">
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 whitespace-nowrap h-4 border-zinc-700 text-gray-300">
                                        {student.shift || 'N/A'}
                                      </Badge>
                                    </div>

                                    <div className="col-span-1">
                                      <Badge variant="default" className="text-[9px] px-1 py-0 whitespace-nowrap h-4 bg-zinc-700 text-gray-300">
                                        {student.sessionStartYear}-{student.sessionEndYear}
                                      </Badge>
                                    </div>

                                    <div className="col-span-1 flex items-center gap-0.5">
                                      <Badge
                                        className={`text-[9px] px-1.5 py-0 font-medium border-0 whitespace-nowrap h-4 ${student.status?.toLowerCase() === 'active'
                                          ? 'bg-green-600/90 text-white'
                                          : 'bg-zinc-700 text-gray-300'
                                          }`}
                                      >
                                        {student.status?.toLowerCase() === 'active' ? 'Active' : (student.status ? student.status.charAt(0).toUpperCase() + student.status.slice(1).toLowerCase() : 'Inactive')}
                                      </Badge>
                                      {isAlreadySelected && (
                                        <CheckCircle className="h-3 w-3 text-purple-500 flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Selected Students - Redesigned Compact Cards */}
                {selectedStudents.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold text-sm text-gray-200 flex items-center gap-1.5">
                        <UserPlus className="h-4 w-4 text-purple-400" />
                        Selected for Renewal ({selectedStudents.length})
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedStudents([])}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30 border-red-800/50 hover:border-red-700/50 h-7 text-xs transition-all"
                      >
                        <XCircle className="mr-1 h-3 w-3" />
                        Clear All
                      </Button>
                    </div>

                    {/* Compact Student Cards */}
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {selectedStudents.map((student, index) => (
                        <div
                          key={student.id}
                          className="relative bg-zinc-800/40 backdrop-blur-sm border border-purple-800/30 rounded-lg p-2 shadow-sm hover:shadow-lg hover:border-purple-600/50 transition-all"
                        >
                          {/* Student Number Badge */}
                          <div className="absolute -left-1.5 -top-1.5 w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-[10px] shadow-lg border-2 border-zinc-900">
                            {index + 1}
                          </div>

                          {/* Main Content Grid */}
                          <div className="flex items-center gap-2">
                            {/* Profile Photo */}
                            <Avatar
                              src={student.profilePhotoUrl}
                              name={student.fullName}
                              size="sm"
                              className="flex-shrink-0"
                            />

                            {/* Student Information Grid - Full Width */}
                            <div className="flex-1 grid grid-cols-10 gap-2 items-center text-[10px]">
                              {/* Student Name & Email */}
                              <div className="col-span-2">
                                <p className="font-semibold text-[11px] text-gray-100 truncate">{student.fullName}</p>
                                <p className="text-[9px] text-gray-400 truncate">{student.email}</p>
                              </div>

                              {/* Enrollment ID */}
                              <div className="col-span-2">
                                <p className="text-[8px] text-gray-500 uppercase tracking-wide mb-0.5">Enrollment</p>
                                <p className="font-mono text-[10px] text-gray-200 font-semibold">{student.enrollmentId}</p>
                              </div>

                              {/* Bus Assigned */}
                              <div className="col-span-2">
                                <p className="text-[8px] text-gray-500 uppercase tracking-wide mb-0.5">Bus Assigned</p>
                                <p className="text-[10px] text-gray-200 font-medium">{getBusDisplay(student.busId)}</p>
                              </div>

                              {/* Session */}
                              <div className="col-span-1">
                                <p className="text-[8px] text-gray-500 uppercase tracking-wide mb-0.5">Session</p>
                                <p className="text-[10px] text-gray-200 font-medium">{student.sessionStartYear}-{student.sessionEndYear}</p>
                              </div>

                              {/* Shift */}
                              <div className="col-span-1">
                                <p className="text-[8px] text-gray-500 uppercase tracking-wide mb-0.5">Shift</p>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 whitespace-nowrap border-zinc-700 text-gray-300">
                                  {student.shift || 'N/A'}
                                </Badge>
                              </div>

                              {/* Status */}
                              <div className="col-span-1">
                                <p className="text-[8px] text-gray-500 uppercase tracking-wide mb-0.5">Status</p>
                                <Badge
                                  className={`text-[9px] px-1.5 py-0 h-4 border-0 whitespace-nowrap ${student.status?.toLowerCase() === 'active'
                                    ? 'bg-green-600/90 text-white'
                                    : 'bg-zinc-700 text-gray-300'
                                    }`}
                                >
                                  {student.status?.toLowerCase() === 'active' ? 'Active' : (student.status ? student.status.charAt(0).toUpperCase() + student.status.slice(1).toLowerCase() : 'Inactive')}
                                </Badge>
                              </div>

                              {/* Duration Selector */}
                              <div className="col-span-1">
                                <p className="text-[8px] text-gray-500 uppercase tracking-wide mb-0.5">Duration</p>
                                <Select
                                  value={(student.duration || 1).toString()}
                                  onValueChange={(value) => handleDurationChange(student.id, parseInt(value))}
                                >
                                  <SelectTrigger className="h-6 text-[10px] bg-zinc-800 text-gray-200 border-zinc-700">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-800 border-zinc-700">
                                    <SelectItem value="1" className="text-[10px]">1 Year</SelectItem>
                                    <SelectItem value="2" className="text-[10px]">2 Years</SelectItem>
                                    <SelectItem value="3" className="text-[10px]">3 Years</SelectItem>
                                    <SelectItem value="4" className="text-[10px]">4 Years</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Remove Button */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveStudent(student.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-950/30 flex-shrink-0 h-6 w-6 p-0 transition-all"
                              title="Remove student"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Confirm Renewal Button */}
                    <Button
                      onClick={handleConfirmRenewal}
                      disabled={isRenewing}
                      className="w-full mt-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold shadow-lg shadow-purple-500/20 h-8 text-sm transition-all"
                    >
                      {isRenewing ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Processing Renewals...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-1.5 h-4 w-4" />
                          Confirm Renewal for {selectedStudents.length} Student{selectedStudents.length > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Info Alert - Only show when students are selected */}
                {selectedStudents.length > 0 && (
                  <Alert className="border-purple-800/30 bg-purple-950/20 backdrop-blur-sm py-2.5 rounded-lg">
                    <Info className="h-3.5 w-3.5 text-purple-400" />
                    <AlertDescription className="text-xs text-gray-300 leading-relaxed">
                      Manual renewals will update student records directly without payment processing.
                      Use this for administrative renewals, scholarships, or special cases.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Approval Tab */}
          <TabsContent value="approval" className="mt-0 px-0 py-4">
            <Card className="border border-zinc-800/50 shadow-xl bg-zinc-900/50 backdrop-blur-sm overflow-hidden p-0">
              <CardHeader className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border-t-2 border-t-green-500 pb-3 pt-3 m-0 rounded-t-lg">
                <CardTitle className="text-base text-gray-900 dark:text-gray-100">Pending Renewal Requests</CardTitle>
                <CardDescription className="text-xs text-gray-600 dark:text-gray-400">
                  Review and approve offline payment renewal requests
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 px-4 pb-4">
                {loadingRequests ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : renewalRequests.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">
                    No pending renewal requests
                  </div>
                ) : (
                  <div className="space-y-2">
                    {renewalRequests.map((request, index) => (
                      <div
                        key={request.id}
                        className="relative bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-2 hover:shadow-md hover:border-green-400 dark:hover:border-green-600 transition-all"
                      >
                        {/* Student Number Badge */}
                        <div className="absolute -left-1.5 -top-1.5 w-6 h-6 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-[10px] shadow-lg border-2 border-white dark:border-gray-900">
                          {index + 1}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Profile Photo */}
                          <Avatar
                            src={request.studentData?.profilePhotoUrl || ''}
                            name={request.studentName}
                            size="sm"
                            className="flex-shrink-0"
                          />

                          {/* Student Info - Compact Layout */}
                          <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                            {/* Student Name & Email */}
                            <div className="col-span-3">
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Student</p>
                              <p className="font-semibold text-[10px] text-gray-900 dark:text-gray-100 truncate leading-tight">{request.studentName}</p>
                              <p className="text-[9px] text-gray-600 dark:text-gray-400 truncate">{request.studentData?.email || 'N/A'}</p>
                            </div>

                            {/* Enrollment */}
                            <div className="col-span-3">
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Enrollment</p>
                              <p className="font-mono text-[10px] text-gray-900 dark:text-gray-100 font-semibold truncate">{request.enrollmentId}</p>
                            </div>

                            {/* Bus Assigned */}
                            <div className="col-span-3">
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Bus Assigned</p>
                              <p className="text-[10px] text-gray-900 dark:text-gray-100 font-medium truncate">
                                {getBusDisplay(request.studentData?.busAssigned || request.studentData?.busId || 'N/A')}
                              </p>
                            </div>

                            {/* Session */}
                            <div className="col-span-2">
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Session</p>
                              <p className="text-[10px] text-gray-900 dark:text-gray-100 font-medium truncate">
                                {request.studentData?.sessionStartYear || 'N/A'}-{request.studentData?.sessionEndYear || 'N/A'}
                              </p>
                            </div>

                            {/* Shift */}
                            <div className="col-span-1">
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Shift</p>
                              <p className="text-[10px] text-gray-900 dark:text-gray-100 font-medium">
                                {request.studentData?.shift || 'N/A'}
                              </p>
                            </div>
                          </div>

                          {/* Renewal Badge */}
                          <div className="flex-shrink-0">
                            <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] h-5 px-1.5">
                              {request.durationYears} Year(s)
                            </Badge>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-1.5 flex-shrink-0">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowViewDialog(true);
                              }}
                              className="h-7 px-2 text-[10px] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-[10px]"
                              onClick={() => handleApproveRequest()}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowRejectDialog(true);
                              }}
                              className="h-7 px-2 text-[10px] bg-red-600 hover:bg-red-700 text-white"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transaction History Tab */}
          <TabsContent value="history" className="mt-0 px-0 py-4">
            <Card className="border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950 overflow-hidden p-0">
              <CardHeader className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50 border-t-2 border-t-purple-500 pb-3 pt-3 m-0 rounded-t-lg px-4">
                <CardTitle className="text-base text-gray-900 dark:text-gray-100 font-bold">Transaction History</CardTitle>
                <CardDescription className="text-xs text-gray-600 dark:text-gray-400">
                  All payment transactions across the system
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 pb-6 px-6">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 w-full">
                  <div>
                    <Label className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 block">Year</Label>
                    <Select value={filterYear} onValueChange={setFilterYear}>
                      <SelectTrigger className="w-full bg-zinc-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 border-zinc-200 dark:border-zinc-800 h-8 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        {[2025, 2024, 2023].map(year => (
                          <SelectItem key={year} value={year.toString()} className="text-[10px]">
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 block">Student ID</Label>
                    <Input
                      placeholder="Enter enrollment ID"
                      value={filterStudentId}
                      onChange={(e) => setFilterStudentId(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 border-zinc-200 dark:border-zinc-800 h-8 text-[10px] placeholder:text-gray-500"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 block">Payment Method</Label>
                    <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                      <SelectTrigger className="w-full bg-zinc-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 border-zinc-200 dark:border-zinc-800 h-8 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <SelectItem value="all" className="text-[10px]">All Methods</SelectItem>
                        <SelectItem value="online" className="text-[10px]">Online (Razorpay)</SelectItem>
                        <SelectItem value="offline" className="text-[10px]">Offline (Manual)</SelectItem>
                        <SelectItem value="manual" className="text-[10px]">Manual (Admin)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[10px] text-transparent mb-1 block select-none">Apply</Label>
                    <Button
                      onClick={() => setCurrentPage(1)}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-8 text-[10px] text-white rounded-md"
                    >
                      <Filter className="mr-1.5 h-3 w-3" />
                      Apply Filters
                    </Button>
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                  </div>
                ) : enrichedTransactions.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-gray-300 dark:border-zinc-800 mx-4">
                    <Receipt className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No transactions found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto pb-6 -mx-2">
                    <div className="w-full space-y-3 px-2">
                      <div className="grid grid-cols-24 gap-2 items-center w-full px-4 py-3 bg-gradient-to-r from-purple-50/50 via-pink-50/50 to-purple-50/50 dark:from-purple-950/20 dark:via-pink-950/20 dark:to-purple-950/20 border border-purple-200/50 dark:border-purple-800/30 rounded-xl mb-3 pl-5 shadow-sm">
                        <div className="col-span-5">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider pl-5">Student Information</p>
                        </div>
                        <div className="col-span-2 text-center">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider mr-3">Mode</p>
                        </div>
                        <div className="col-span-4">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider ml-6">Reference ID</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider ml-2">Date/Time</p>
                        </div>
                        <div className="col-span-3">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider ml-8">Amount</p>
                        </div>
                        <div className="col-span-4 text-left pl-2">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider whitespace-nowrap ml-2">Approved By</p>
                        </div>
                        <div className="col-span-4 text-right pr-2">
                          <p className="text-[9px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider mr-14">Actions</p>
                        </div>
                      </div>

                      {enrichedTransactions.map((transaction, index) => (
                        <div
                          key={index}
                          className="relative bg-gradient-to-br from-white via-purple-50/20 to-white dark:from-gray-800 dark:via-purple-950/10 dark:to-gray-800 border border-purple-200 dark:border-purple-800/50 rounded-lg shadow-sm hover:shadow-lg hover:border-purple-400 dark:hover:border-purple-500 transition-all duration-300 overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 via-pink-500 to-purple-500"></div>

                          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-br from-purple-600 via-pink-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-[12px] shadow-xl border-4 border-white dark:border-gray-900 z-10 scale-110">
                            #{index + 1}
                          </div>

                          <div className="grid grid-cols-24 gap-2 items-center w-full px-5 py-4 pl-8">
                            {/* Student Details */}
                            <div className="col-span-5 flex items-center gap-2">
                              <div className="relative">
                                <Avatar
                                  name={transaction.studentName}
                                  size="sm"
                                  className="ring-1 ring-purple-100 dark:ring-purple-900/50 h-8 w-8"
                                />
                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white dark:border-gray-800"></div>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate">{transaction.studentName}</p>
                                <p className="text-[9px] font-mono font-medium text-purple-600 dark:text-purple-400 break-all leading-tight mt-0.5">{transaction.studentId}</p>
                              </div>
                            </div>

                            {/* Payment Method */}
                            <div className="col-span-2 text-center">
                              <Badge className={`${transaction.paymentMethod === 'online'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                                } text-[9px] font-black px-1.5 py-0 rounded-full capitalize mr-20`}>
                                {transaction.paymentMethod === 'online' ? 'Online' : 'Offline'}
                              </Badge>
                            </div>

                            {/* Payment ID */}
                            <div className="col-span-4">
                              <div className="group/id flex items-center gap-1.5 bg-gray-50 dark:bg-zinc-900/50 rounded-lg px-2 py-0.5 border border-zinc-200 dark:border-zinc-800 hover:border-purple-400 dark:hover:border-purple-500/50 transition-colors h-7 w-fit max-w-[130px]">
                                <p className="text-[8px] font-mono text-gray-500 dark:text-gray-400 truncate flex-1">{transaction.paymentId}</p>
                                <Copy className="h-2.5 w-2.5 text-gray-400 group-hover/id:text-purple-500 cursor-pointer flex-shrink-0" onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(transaction.paymentId);
                                  toast.success('Payment ID copied!');
                                }} />
                              </div>
                            </div>

                            {/* Date & Time */}
                            <div className="col-span-2">
                              <p className="text-[10px] font-bold text-gray-900 dark:text-gray-100">
                                {new Date(transaction.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                              <p className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">{new Date(transaction.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>

                            {/* Amount */}
                            <div className="col-span-3">
                              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-1.5 py-0.5 border border-emerald-100 dark:border-emerald-900/50 shadow-sm inline-block ml-5">
                                <p className="text-[16px] font-black text-emerald-700 dark:text-emerald-400 leading-tight">₹{transaction.amount}</p>
                                <p className="text-[8px] text-orange-600 dark:text-orange-500 font-bold whitespace-nowrap ml-2">{transaction.durationYears} Yr Plan</p>
                              </div>
                            </div>

                            {/* Approved By */}
                            <div className="col-span-4 text-left pl-2 ml-1">
                              <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate" title={transaction.approvedBy}>
                                {transaction.approvedBy || '-'}
                              </p>
                            </div>

                            {/* Actions Buttons */}
                            <div className="col-span-4 flex flex-col items-end gap-1 pr-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadReceipt(transaction.paymentId)}
                                className="h-7 gap-1.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 w-full shadow-sm px-2"
                              >
                                <Download className="h-2.5 w-2.5" />
                                DOWNLOAD
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (transaction.userId) {
                                    const baseRoute = userData?.role === 'moderator' ? '/moderator' : '/admin';
                                    router.push(`${baseRoute}/students/view/${transaction.userId}`);
                                  }
                                }}
                                className="h-5 text-[9px] font-bold w-full text-zinc-500 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                              >
                                VIEW PROFILE
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-7 text-[10px]"
                    >
                      Previous
                    </Button>
                    <span className="text-[10px] font-medium text-gray-500">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-7 text-[10px]"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs >

        {/* View Details Dialog - Redesigned */}
        < Dialog open={showViewDialog} onOpenChange={setShowViewDialog} >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">Renewal Request Details</DialogTitle>
              <DialogDescription>
                Review payment evidence and take action
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                {/* Student Profile Compact Header */}
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <Avatar
                    src={selectedRequest.studentData?.profilePhotoUrl || ''}
                    name={selectedRequest.studentName}
                    size="lg"
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{selectedRequest.studentName}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{selectedRequest.enrollmentId}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge className="bg-yellow-500 text-white text-xs">PENDING</Badge>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedRequest.createdAt?.toDate ? new Date(selectedRequest.createdAt.toDate()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Essential Student Info - 2 Column Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Email</Label>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{selectedRequest.studentEmail || selectedRequest.studentData?.email || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Phone Number</Label>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedRequest.studentData?.phoneNumber || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Bus Assigned</Label>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {getBusDisplay(selectedRequest.studentData?.busAssigned || 'N/A')}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Shift</Label>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedRequest.studentData?.shift || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Session</Label>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {selectedRequest.studentData?.sessionStartYear || 'N/A'} - {selectedRequest.studentData?.sessionEndYear || 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Faculty</Label>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{selectedRequest.studentData?.faculty || 'N/A'}</p>
                  </div>
                </div>

                {/* Renewal Payment Details */}
                <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border-2 border-green-300 dark:border-green-700">
                  <h3 className="font-semibold text-sm text-green-800 dark:text-green-300 mb-3">Renewal Payment Details</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-gray-600 dark:text-gray-400">Duration</Label>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">{selectedRequest.durationYears} Year(s)</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600 dark:text-gray-400">Amount</Label>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-400">₹{selectedRequest.totalFee.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600 dark:text-gray-400">Payment Mode</Label>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedRequest.paymentMode || 'Offline'}</p>
                    </div>
                  </div>
                  {selectedRequest.transactionId && (
                    <div className="mt-3 pt-3 border-t border-green-300 dark:border-green-700">
                      <Label className="text-xs text-gray-600 dark:text-gray-400">Transaction ID</Label>
                      <p className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100 break-all">{selectedRequest.transactionId}</p>
                    </div>
                  )}
                </div>

                {/* Payment Receipt */}
                {selectedRequest.receiptImageUrl && (
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">Payment Receipt/Evidence</Label>
                    <div className="border-2 border-green-300 dark:border-green-700 rounded-lg overflow-hidden">
                      <img
                        src={selectedRequest.receiptImageUrl}
                        alt="Payment Receipt"
                        className="w-full h-auto max-h-96 object-contain bg-gray-100 dark:bg-gray-800"
                      />
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowViewDialog(false)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setShowViewDialog(false);
                      setShowRejectDialog(true);
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleApproveRequest}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Approve Renewal
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog >

        {/* Reject Dialog */}
        < Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog} >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Renewal Request</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting this renewal request
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Rejection Reason</Label>
                <Textarea
                  placeholder="Enter the reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectionReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectRequest}
                disabled={processing || !rejectionReason.trim()}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Reject Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog >

        {/* Payment Detail Modal for Manual Payments */}
        < PaymentDetailModal
          isOpen={showPaymentDetailModal}
          onClose={() => {
            setShowPaymentDetailModal(false);
            setSelectedPaymentId(null);
          }
          }
          paymentId={selectedPaymentId}
        />
      </div >
    </div >
  );
}
