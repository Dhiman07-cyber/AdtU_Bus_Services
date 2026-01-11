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
}

export default function ModeratorRenewalRequestsPage() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RenewalRequest | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  // Redirect if not moderator
  useEffect(() => {
    if (userData && userData.role !== "moderator") {
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

        setRenewalRequests(requests);
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
            filteredRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {request.studentName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {request.enrollmentId} • {request.studentEmail}
                      </CardDescription>
                    </div>
                    <Badge
                      className={
                        request.status === "approved"
                          ? "bg-green-500"
                          : request.status === "rejected"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                      }
                    >
                      {request.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label className="text-xs text-gray-600">Duration</Label>
                      <p className="font-semibold">{request.durationYears} Year(s)</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Total Fee</Label>
                      <p className="font-semibold flex items-center">
                        <IndianRupee className="h-4 w-4" />
                        {request.totalFee?.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Payment Mode</Label>
                      <p className="font-semibold capitalize">{request.paymentMode}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Requested On</Label>
                      <p className="font-semibold">{formatDate(request.createdAt)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleView(request)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>

                    {request.status === "pending" && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(request)}
                          disabled={processing}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRejectClick(request)}
                          disabled={processing}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
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
              {/* Student Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-600">Student Name</Label>
                  <p className="font-semibold">{selectedRequest.studentName}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Enrollment ID</Label>
                  <p className="font-semibold">{selectedRequest.enrollmentId}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Email</Label>
                  <p className="font-semibold">{selectedRequest.studentEmail}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Status</Label>
                  <Badge
                    className={
                      selectedRequest.status === "approved"
                        ? "bg-green-500"
                        : selectedRequest.status === "rejected"
                          ? "bg-red-500"
                          : "bg-yellow-500"
                    }
                  >
                    {selectedRequest.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

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
                  <h3 className="font-semibold mb-3">Payment Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-gray-600">Payment Mode</Label>
                      <p className="font-semibold capitalize">{selectedRequest.paymentMode}</p>
                    </div>
                    {selectedRequest.paymentReference && (
                      <div>
                        <Label className="text-xs text-gray-600">Transaction ID</Label>
                        <p className="font-semibold font-mono">{selectedRequest.paymentReference}</p>
                      </div>
                    )}
                    {selectedRequest.paymentEvidenceUrl && (
                      <div>
                        <Label className="text-xs text-gray-600">Payment Receipt</Label>
                        <div className="mt-2 border rounded-lg overflow-hidden">
                          <Image
                            src={selectedRequest.paymentEvidenceUrl}
                            alt="Payment Receipt"
                            width={600}
                            height={400}
                            className="w-full h-auto"
                          />
                        </div>
                      </div>
                    )}
                  </div>
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
