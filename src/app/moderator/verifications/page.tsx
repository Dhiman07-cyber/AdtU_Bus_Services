"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/contexts/toast-context';
import { Loader2, Eye, CheckCircle, Shield, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function ModeratorVerificationsPage() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loadingVerifications, setLoadingVerifications] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!currentUser || !userData || userData.role !== 'moderator') {
        router.push('/login');
        return;
      }
      loadVerifications();
    }
  }, [loading, currentUser, userData, router]);

  const loadVerifications = async (showLoading = true) => {
    try {
      if (showLoading) setLoadingVerifications(true);
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/moderators/verifications/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setVerifications(data.verifications || []);
      }
    } catch (error) {
      console.error('Error loading verifications:', error);
      showToast('Failed to load verifications', 'error');
    } finally {
      if (showLoading) setLoadingVerifications(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadVerifications(false);
    setIsRefreshing(false);
  };

  if (loading || loadingVerifications) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment Verifications</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Verify student payments and provide verification codes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {verifications.length} Pending
          </Badge>
        </div>
      </div>

      <Card className="bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle>Pending Verification Requests</CardTitle>
          <CardDescription>
            Students waiting for payment verification
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verifications.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                No pending verification requests
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Enrollment ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verifications.map((verification) => (
                  <TableRow key={verification.applicationId}>
                    <TableCell className="font-medium">
                      {verification.formData.fullName}
                    </TableCell>
                    <TableCell>{verification.formData.enrollmentId}</TableCell>
                    <TableCell>
                      ?{verification.formData.paymentInfo.amountPaid.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {verification.formData.paymentInfo.paymentMode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(verification.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Link href={`/moderator/verifications/${verification.applicationId}`}>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

