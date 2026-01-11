"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/contexts/toast-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertCircle,
  FileText,
  User,
  Calendar,
  IndianRupee,
  Loader2
} from "lucide-react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";

interface StudentData {
  fullName: string;
  email: string;
  phoneNumber: string;
  alternatePhoneNumber?: string;
  enrollmentId: string;
  faculty: string;
  course: string;
  semester: string;
  gender: string;
  busAssigned: string;
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
  studentEmail: string;
  enrollmentId: string;
  durationYears: number;
  totalFee: number;
  paymentMode: string;
  paymentReference?: string;
  paymentEvidenceUrl?: string;
  receiptImageUrl?: string;
  transactionId?: string;
  currentValidUntil: any;
  requestedValidUntil: any;
  requestedSessionEndYear?: number;
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

export default function AdminRenewalRequestsPage() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStudentData, setLoadingStudentData] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RenewalRequest | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  // Redirect if not admin
  useEffect(() => {
    if (userData && userData.role !== "admin") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  // Fetch renewal requests
  useEffect(() => {
    const fetchRenewalRequests = async () => {
      if (!currentUser) return;

      try {
        setLoading(true);
        const renewalRef = collection(db, "renewal_requests");
        const q = query(renewalRef);
        const snapshot = await getDocs(q);

        const requests: RenewalRequest[] = [];
        snapshot.forEach((doc) => {
          requests.push({ id: doc.id, ...doc.data() } as RenewalRequest);
        });

        // Sort by createdAt desc
        requests.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        // Fetch student data for each request
        setLoadingStudentData(true);
        const requestsWithStudentData = await Promise.all(
          requests.map(async (request) => {
            try {
              const studentDoc = await getDoc(doc(db, "students", request.studentId));
              if (studentDoc.exists()) {
                return { ...request, studentData: studentDoc.data() as StudentData };
              }
              return request;
            } catch (error) {
              console.error(`Error fetching student data for ${request.studentId}:`, error);
              return request;
            }
          })
        );
        setLoadingStudentData(false);

        setRenewalRequests(requestsWithStudentData);
      } catch (error) {
        console.error("Error fetching renewal requests:", error);
        showToast("Failed to load renewal requests", "error");
      } finally {
        setLoading(false);
      }
    };

    if (currentUser) {
      fetchRenewalRequests();
    }
  }, [currentUser]);

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "N/A";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return "Invalid date";
    }
  };

  const handleView = (request: RenewalRequest) => {
    setSelectedRequest(request);
    setShowViewDialog(true);
  };

  const handleApprove = async (request: RenewalRequest) => {
    if (!currentUser || !userData) return;

    if (!confirm(`Approve renewal request for ${request.studentName}?`)) return;

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/renewal-requests/approve-v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: request.id,
          approverName: userData.fullName || userData.name,
          approverId: currentUser.uid
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve request");
      }

      showToast("Renewal request approved successfully!", "success");

      // Refresh list
      setRenewalRequests(prev => prev.map(r =>
        r.id === request.id ? { ...r, status: 'approved' as const, approvedBy: currentUser.uid, approvedAt: new Date() } : r
      ));

      setShowViewDialog(false);
    } catch (error: any) {
      console.error("Error approving request:", error);
      showToast(error.message || "Failed to approve request", "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectClick = (request: RenewalRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedRequest || !currentUser || !userData) return;

    if (!rejectionReason.trim()) {
      showToast("Please provide a rejection reason", "error");
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/renewal-requests/reject", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          rejectorName: userData.fullName || userData.name,
          rejectorId: currentUser.uid,
          reason: rejectionReason
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reject request");
      }

      showToast("Renewal request rejected", "success");

      // Refresh list: remove the rejected request
      setRenewalRequests(prev => prev.filter(r => r.id !== selectedRequest.id));

      setShowRejectDialog(false);
      setShowViewDialog(false);
    } catch (error: any) {
      console.error("Error rejecting request:", error);
      showToast(error.message || "Failed to reject request", "error");
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = renewalRequests.filter(request => {
    if (activeTab === "pending") return request.status === "pending";
    if (activeTab === "approved") return request.status === "approved";
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl mt-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Renewal Requests</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Review and manage student service renewal requests
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="pending">
        <TabsList className="flex w-full mb-6">
          <TabsTrigger value="pending" className="flex-1">
            Pending ({renewalRequests.filter(r => r.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex-1">
            Approved ({renewalRequests.filter(r => r.status === "approved").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {filteredRequests.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No {activeTab} renewal requests found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4">
              {filteredRequests.map((request) => (
                <Card key={request.id} className="hover:shadow-lg transition-all hover:border-blue-300 border-2">
                  <CardContent className="p-6">
                    <div className="flex gap-6">
                      {/* Student Photo */}
                      <div className="flex-shrink-0">
                        <Avatar className="h-20 w-20 border-2 border-gray-200">
                          <AvatarImage src={request.studentData?.profilePhotoUrl || ""} alt={request.studentName} />
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xl font-bold">
                            {request.studentName.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                      </div>

                      {/* Student Info Grid */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4">
                        {/* Column 1: Name & Email */}
                        <div className="md:col-span-2">
                          <div className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">
                            {request.studentName}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 break-words">
                            {request.studentEmail}
                          </div>
                        </div>

                        {/* Column 2: Enrollment & Phone */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Enrollment</div>
                          <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {request.enrollmentId}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {request.studentData?.phoneNumber || "N/A"}
                          </div>
                        </div>

                        {/* Column 3: Faculty & Course */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Faculty</div>
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                            {request.studentData?.faculty || "N/A"}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {request.studentData?.course || "N/A"}
                          </div>
                        </div>

                        {/* Column 4: Bus & Shift */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Bus & Shift</div>
                          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {request.studentData?.busAssigned?.replace("bus_", "Bus-").replace("bus", "Bus-") || "N/A"}
                          </div>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {request.studentData?.shift || "N/A"}
                          </Badge>
                        </div>

                        {/* Column 5: Duration & Amount */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Renewal</div>
                          <div className="font-bold text-lg text-blue-600">
                            {request.durationYears} Year(s)
                          </div>
                          <div className="flex items-center text-sm font-semibold text-green-600 mt-1">
                            <IndianRupee className="h-3 w-3" />
                            {request.totalFee?.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0 flex flex-col items-end gap-2">
                        <Badge
                          className={
                            request.status === "approved"
                              ? "bg-green-600 text-white"
                              : request.status === "rejected"
                                ? "bg-red-600 text-white"
                                : "bg-yellow-500 text-white"
                          }
                        >
                          {request.status.toUpperCase()}
                        </Badge>
                        <div className="text-xs text-gray-500">
                          {formatDate(request.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(request)}
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>

                      {request.status === "pending" && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 flex-1"
                            onClick={() => handleApprove(request)}
                            disabled={processing}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve Payment
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRejectClick(request)}
                            disabled={processing}
                            className="flex-1"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject Payment
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* View Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Renewal Request Details</DialogTitle>
            <DialogDescription>
              Review the complete renewal request information
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Student Profile Header */}
              <div className="flex gap-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200">
                <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                  <AvatarImage src={selectedRequest.studentData?.profilePhotoUrl || ""} alt={selectedRequest.studentName} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
                    {selectedRequest.studentName.split(" ").map(n => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedRequest.studentName}</h3>
                  <p className="text-gray-600 font-mono font-semibold">{selectedRequest.enrollmentId}</p>
                  <p className="text-gray-600 mt-1">{selectedRequest.studentEmail}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge
                      className={
                        selectedRequest.status === "approved"
                          ? "bg-green-600 text-white"
                          : selectedRequest.status === "rejected"
                            ? "bg-red-600 text-white"
                            : "bg-yellow-500 text-white"
                      }
                    >
                      {selectedRequest.status.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {selectedRequest.studentData?.gender || "N/A"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Complete Student Information */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Phone Number</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.phoneNumber || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Alternate Phone</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.alternatePhoneNumber || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Emergency Contact</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.emergencyContact || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Faculty</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.faculty || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Course</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.course || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Semester</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.semester || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Bus Assigned</Label>
                  <p className="font-semibold text-gray-900">
                    {selectedRequest.studentData?.busAssigned?.replace("bus_", "Bus-").replace("bus", "Bus-") || "N/A"}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Shift</Label>
                  <p className="font-semibold text-gray-900">{selectedRequest.studentData?.shift || "N/A"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600">Session</Label>
                  <p className="font-semibold text-gray-900">
                    {selectedRequest.studentData?.sessionStartYear || "N/A"} - {selectedRequest.studentData?.sessionEndYear || "N/A"}
                  </p>
                </div>
              </div>

              {/* Address */}
              {selectedRequest.studentData?.address && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <Label className="text-xs text-gray-600">Address</Label>
                  <p className="font-medium text-gray-900 mt-1">{selectedRequest.studentData.address}</p>
                </div>
              )}

              {/* Renewal Details */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Renewal Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-600">Duration</Label>
                    <p className="font-semibold">{selectedRequest.durationYears} Year(s)</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Total Fee</Label>
                    <p className="font-semibold flex items-center">
                      <IndianRupee className="h-4 w-4" />
                      {selectedRequest.totalFee?.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Current Valid Until</Label>
                    <p className="font-semibold">{formatDate(selectedRequest.currentValidUntil)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Requested Valid Until</Label>
                    <p className="font-semibold">{formatDate(selectedRequest.requestedValidUntil)}</p>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              {selectedRequest.paymentMode === "offline" && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-lg mb-4 text-purple-600">Payment Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <Label className="text-xs text-gray-600">Payment Mode</Label>
                      <p className="font-semibold capitalize text-purple-900">{selectedRequest.paymentMode}</p>
                    </div>
                    {(selectedRequest.paymentReference || selectedRequest.transactionId) && (
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <Label className="text-xs text-gray-600">Transaction ID</Label>
                        <p className="font-semibold font-mono text-purple-900">
                          {selectedRequest.paymentReference || selectedRequest.transactionId}
                        </p>
                      </div>
                    )}
                  </div>
                  {(selectedRequest.paymentEvidenceUrl || selectedRequest.receiptImageUrl) && (
                    <div className="mt-4">
                      <Label className="text-sm font-semibold text-gray-700 mb-2 block">Payment Receipt</Label>
                      <div className="border-4 border-purple-200 rounded-lg overflow-hidden shadow-lg">
                        <Image
                          src={selectedRequest.paymentEvidenceUrl || selectedRequest.receiptImageUrl || ""}
                          alt="Payment Receipt"
                          width={800}
                          height={600}
                          className="w-full h-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Rejection Reason */}
              {selectedRequest.status === "rejected" && selectedRequest.rejectionReason && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 text-red-600">Rejection Reason</h3>
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {selectedRequest.rejectionReason}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedRequest?.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleRejectClick(selectedRequest)}
                  disabled={processing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleApprove(selectedRequest)}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve
                </Button>
              </>
            )}
            {selectedRequest?.status !== "pending" && (
              <Button variant="outline" onClick={() => setShowViewDialog(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Renewal Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this renewal request. The student will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">Rejection Reason *</Label>
              <Textarea
                id="reason"
                placeholder="Enter the reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="mt-2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={processing || !rejectionReason.trim()}
            >
              {processing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
