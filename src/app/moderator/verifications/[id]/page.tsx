"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/contexts/toast-context';
import { Loader2, CheckCircle, XCircle, Eye, Copy, Check } from 'lucide-react';
import Image from 'next/image';
import { Application } from '@/lib/types/application';

export default function VerificationDetailPage() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { showToast } = useToast();
  const applicationId = params?.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [loadingApp, setLoadingApp] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!currentUser || !userData || userData.role !== 'moderator') {
        router.push('/login');
        return;
      }
      loadApplication();
      loadVerificationCode();
    }
  }, [loading, currentUser, userData, router, applicationId]);

  const loadApplication = async () => {
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch(`/api/applications/${applicationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setApplication(data.application);
      }
    } catch (error) {
      console.error('Error loading application:', error);
      showToast('Failed to load application', 'error');
    } finally {
      setLoadingApp(false);
    }
  };

  const loadVerificationCode = async () => {
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch(`/api/moderators/verification-code/${applicationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setVerificationCode(data.code);
      }
    } catch (error) {
      console.error('Error loading code:', error);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(verificationCode);
    setCopied(true);
    showToast('Code copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || loadingApp) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Verification Request</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Review payment evidence and provide verification code
          </p>
        </div>
        <Badge variant={
          application.state === 'verified' ? 'default' :
            application.state === 'awaiting_verification' ? 'secondary' :
              'outline'
        }>
          {application.state}
        </Badge>
      </div>

      {/* Student Information */}
      <Card className="bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle>Student Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Full Name</p>
              <p className="font-medium">{application.formData.fullName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Enrollment ID</p>
              <p className="font-medium">{application.formData.enrollmentId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
              <p className="font-medium">{application.formData.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
              <p className="font-medium">{application.formData.phoneNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Department</p>
              <p className="font-medium">{application.formData.department}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Semester</p>
              <p className="font-medium">{application.formData.semester}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Information */}
      <Card className="bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle>Payment Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Amount Paid</p>
              <p className="text-2xl font-bold text-green-600">
                ₹{application.formData.paymentInfo.amountPaid.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Payment Mode</p>
              <Badge variant="outline" className="mt-1">
                {application.formData.paymentInfo.paymentMode}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">UPI ID / Reference</p>
              <p className="font-mono font-bold text-lg text-blue-600 dark:text-blue-400">
                {application.formData.paymentInfo.paymentReference || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Session Duration</p>
              <p className="font-medium">
                {application.formData.sessionInfo.durationYears} Year(s)
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Shift</p>
              <p className="font-medium capitalize">{application.formData.shift}</p>
            </div>
          </div>

          {/* Payment Receipt */}
          {application.formData.paymentInfo.paymentEvidenceUrl && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Payment Receipt</p>
              <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                <Image
                  src={application.formData.paymentInfo.paymentEvidenceUrl}
                  alt="Payment receipt"
                  width={600}
                  height={400}
                  className="max-h-96 rounded object-contain mx-auto"
                />
                <div className="mt-4 text-center">
                  <a
                    href={application.formData.paymentInfo.paymentEvidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View Full Size
                  </a>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Code */}
      {application.state === 'awaiting_verification' && verificationCode && (
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">
              Verification Code
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              Provide this code to the student after verifying their payment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-white dark:bg-gray-900 border-2 border-blue-300 dark:border-blue-700 rounded-lg p-6 text-center">
                <p className="text-5xl font-mono font-bold text-blue-600 tracking-widest">
                  {verificationCode}
                </p>
              </div>
              <Button
                onClick={handleCopyCode}
                variant="outline"
                className="h-full"
              >
                {copied ? (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-4 text-center">
              The student will enter this code in their application to complete verification.
            </p>
          </CardContent>
        </Card>
      )}

      {application.state === 'verified' && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-green-900 dark:text-green-100">
              <CheckCircle className="h-6 w-6" />
              <div>
                <p className="font-semibold">Payment Verified</p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Verified on {new Date(application.verifiedAt!).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        <Button
          variant="outline"
          onClick={() => router.push('/moderator/verifications')}
          className="flex-1"
        >
          Back to Verifications
        </Button>
      </div>
    </div>
  );
}

