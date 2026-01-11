"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  CreditCard,
  Wallet,
  Building2,
  CheckCircle,
  AlertCircle,
  Info,
  IndianRupee,
  Loader2,
  Upload,
  X,
  FileText,
  Sparkles,
  Lock,
  Zap,
  Calendar,
  Clock,
  ShieldCheck,
  Receipt,
  ArrowLeft
} from 'lucide-react';
import Image from 'next/image';
import { useRazorpay } from '@/hooks/useRazorpay';
import { toast } from 'sonner';
import {
  PaymentSession,
  savePaymentSession,
  getCurrentPaymentSession,
  updatePaymentSessionStatus,
  storePaymentReceipt,
  hasCompletedPayment,
  calculateFee
} from '@/lib/payment/application-payment.service';

interface PaymentModeSelectorProps {
  amount: number;
  duration: number;
  sessionStartYear: number;
  sessionEndYear: number;
  validUntil: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  enrollmentId?: string;
  purpose: 'new_registration' | 'renewal';
  showHeader?: boolean;
  initialPaymentId?: string;
  initialReceiptPreview?: string;
  onPaymentComplete?: (paymentDetails: any) => void;
  onOfflineSelected?: (data: { paymentId?: string; receiptUrl?: string }) => void;
  onReceiptFileSelect?: (file: File) => void;
  onBack?: () => void;
  isFormComplete?: boolean;
}

export default function PaymentModeSelector({
  amount,
  duration,
  sessionStartYear,
  sessionEndYear,
  validUntil,
  userId,
  userName,
  userEmail,
  userPhone,
  enrollmentId,
  purpose,
  showHeader = true,
  initialPaymentId = '',
  initialReceiptPreview = '',
  onPaymentComplete,
  onOfflineSelected,
  onReceiptFileSelect,
  onBack,
  isFormComplete = true
}: PaymentModeSelectorProps) {
  const [paymentMode, setPaymentMode] = useState<'online' | 'offline'>('online');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isProcessingOffline, setIsProcessingOffline] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  // Offline payment states
  const [offlinePaymentId, setOfflinePaymentId] = useState(initialPaymentId);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>(initialReceiptPreview);

  const { processPayment, isProcessing } = useRazorpay();

  // Update local state when initial props change (for draft loading)
  useEffect(() => {
    if (initialPaymentId) {
      setOfflinePaymentId(initialPaymentId);
      // If we have data, switch to offline mode automatically
      setPaymentMode('offline');
    }
  }, [initialPaymentId]);

  useEffect(() => {
    if (initialReceiptPreview) {
      setReceiptPreview(initialReceiptPreview);
      if (initialReceiptPreview && !paymentCompleted) {
        setPaymentMode('offline');
      }
    }
  }, [initialReceiptPreview, paymentCompleted]);

  // Check for existing payment session
  useEffect(() => {
    const existingSession = getCurrentPaymentSession();
    if (existingSession && existingSession.userId === userId && existingSession.purpose === purpose) {
      if (existingSession.status === 'completed') {
        setPaymentCompleted(true);
        setPaymentDetails({
          paymentId: existingSession.razorpayPaymentId,
          orderId: existingSession.razorpayOrderId,
          amount: existingSession.amount
        });
      }
    }

    // Check if user has already completed payment
    if (hasCompletedPayment(userId, purpose)) {
      setPaymentCompleted(true);
      toast.info('Payment already completed for this registration');
    }
  }, [userId, purpose]);

  const handleOnlinePayment = async () => {
    if (paymentCompleted) {
      toast.warning('Payment already completed');
      return;
    }

    setIsProcessingPayment(true);

    try {
      // Create payment session
      const session: PaymentSession = {
        userId,
        userName,
        userEmail,
        userPhone,
        enrollmentId,
        amount,
        purpose,
        duration,
        sessionStartYear,
        sessionEndYear,
        validUntil,
        paymentMode: 'online',
        status: 'processing',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      savePaymentSession(session);

      // Process payment with Razorpay - pass all required fields for renewal
      const result = await processPayment({
        amount,
        userId,
        userName,
        userEmail,
        userPhone,
        enrollmentId: enrollmentId,  // Pass enrollmentId directly
        durationYears: duration,      // Pass duration as number (top level allows number)
        purpose: purpose, // Must be one of the allowed enums: 'new_registration' | 'renewal'
        notes: {
          enrollmentId: enrollmentId || 'N/A',
          sessionStartYear: String(sessionStartYear),
          sessionEndYear: String(sessionEndYear),
          duration: String(duration),
          durationYears: String(duration),
          purpose,
          type: purpose
        }
      });

      if (result.success) {
        // Update payment session
        updatePaymentSessionStatus(userId, purpose, 'completed', {
          razorpayOrderId: result.orderId,
          razorpayPaymentId: result.paymentId,
          paymentReceipt: result.signature
        });

        // Store payment receipt
        storePaymentReceipt(userId, purpose, {
          orderId: result.orderId!,
          paymentId: result.paymentId!,
          signature: result.signature!,
          amount,
          timestamp: new Date().toISOString()
        });

        setPaymentCompleted(true);
        setPaymentDetails({
          paymentId: result.paymentId,
          orderId: result.orderId,
          amount: amount,
          status: 'success',
          method: result.details?.method || 'card',
          time: new Date().toISOString()
        });

        toast.success('Payment completed successfully!');

        if (onPaymentComplete) {
          onPaymentComplete({
            razorpayPaymentId: result.paymentId,
            razorpayOrderId: result.orderId,
            amount,
            paymentStatus: 'success',
            paymentMethod: result.details?.method || 'card',
            paymentTime: new Date().toISOString(),
            sessionInfo: {
              sessionStartYear,
              sessionEndYear,
              duration,
              validUntil
            }
          });
        }
      } else {
        // Update session status to failed
        updatePaymentSessionStatus(userId, purpose, 'failed');
        toast.error(result.error || 'Payment failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      updatePaymentSessionStatus(userId, purpose, 'failed');
      toast.error('Payment processing failed. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PNG, JPG, and JPEG files are allowed');
      return;
    }

    console.log('📁 Receipt file selected:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Store the file locally
    setReceiptFile(file);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setReceiptPreview(previewUrl);

    // Notify parent component about the file selection
    if (onReceiptFileSelect) {
      console.log('✅ Passing receipt file to parent form');
      onReceiptFileSelect(file);
    } else {
      console.warn('⚠️ No onReceiptFileSelect callback provided');
    }

    // Notify parent about offline payment selection with transaction ID
    if (onOfflineSelected && offlinePaymentId.trim()) {
      onOfflineSelected({
        paymentId: offlinePaymentId,
        receiptUrl: previewUrl // Pass preview URL temporarily
      });
    }

    toast.success('✅ Receipt ready! It will be uploaded when you submit the form.');
  };

  const handleOfflinePayment = async () => {
    if (paymentCompleted) {
      toast.warning('Payment already completed');
      return;
    }

    if (!offlinePaymentId.trim()) {
      toast.error('Please enter UPI Transaction ID');
      return;
    }

    if (!receiptFile) {
      toast.error('Please upload payment receipt');
      return;
    }

    setIsProcessingOffline(true);

    try {
      // Create offline payment session
      const session: PaymentSession = {
        userId,
        userName,
        userEmail,
        userPhone,
        enrollmentId,
        amount,
        purpose,
        duration,
        sessionStartYear,
        sessionEndYear,
        validUntil,
        paymentMode: 'offline',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      savePaymentSession(session);

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (onOfflineSelected) {
        onOfflineSelected({
          paymentId: offlinePaymentId,
          receiptUrl: receiptPreview
        });
      }

      toast.success('Offline payment request submitted successfully!');
    } catch (error) {
      console.error('Offline payment error:', error);
      toast.error('Failed to submit offline payment request');
    } finally {
      setIsProcessingOffline(false);
    }
  };

  return (
    <Card className="w-full border-0 shadow-xl sm:shadow-2xl bg-[#0d1117] border border-white/5 backdrop-blur-sm overflow-hidden flex flex-col h-full">
      {showHeader && (
        <CardHeader className="relative pb-4 sm:pb-6 pt-5 sm:pt-8 px-4 sm:px-6 bg-white/[0.02] border-b border-white/5">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl sm:rounded-2xl blur-md opacity-50 animate-pulse"></div>
                  <div className="relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg">
                    <Wallet className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                  </div>
                </div>
                <div className="min-w-0">
                  <CardTitle className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent font-black text-sm sm:text-2xl truncate">
                    Payment Information
                  </CardTitle>
                  <CardDescription className="text-[8px] sm:text-sm text-gray-500 mt-0.5 truncate">
                    Complete your transaction securely
                  </CardDescription>
                </div>
              </div>

              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="h-8 sm:h-10 px-2 sm:px-4 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-xl transition-all flex-shrink-0"
                >
                  <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider hidden sm:inline">Change Duration</span>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:hidden">Change</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      )}

      <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Payment Summary Card - Compact */}
        <div className="relative overflow-hidden rounded-lg shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600"></div>

          <div className="relative p-2.5 md:p-3 space-y-2">
            {/* Header */}
            <div className="flex items-center gap-1.5">
              <div className="p-1 bg-white/20 rounded-md">
                <Receipt className="h-3 w-3 text-white" />
              </div>
              <h3 className="font-bold text-xs text-white">Payment Summary</h3>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              <div className="p-1 sm:p-2 bg-white/15 backdrop-blur-sm rounded-lg lg:rounded-xl">
                <div className="flex items-center gap-0.5 mb-0.5">
                  <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-200" />
                  <span className="text-[7px] sm:text-[9px] text-blue-100 font-semibold uppercase tracking-wider">Duration</span>
                </div>
                <p className="font-black text-[9px] sm:text-xs text-white uppercase">{duration} Year{duration > 1 ? 's' : ''}</p>
              </div>

              <div className="p-1 sm:p-2 bg-white/15 backdrop-blur-sm rounded-lg lg:rounded-xl">
                <div className="flex items-center gap-0.5 mb-0.5">
                  <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-purple-200" />
                  <span className="text-[7px] sm:text-[9px] text-purple-100 font-semibold uppercase tracking-wider">Session</span>
                </div>
                <p className="font-black text-[9px] sm:text-xs text-white">{sessionStartYear}-{sessionEndYear}</p>
              </div>

              <div className="p-1 sm:p-2 bg-white/15 backdrop-blur-sm rounded-lg lg:rounded-xl">
                <div className="flex items-center gap-0.5 mb-0.5">
                  <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-300" />
                  <span className="text-[7px] sm:text-[9px] text-green-100 font-semibold uppercase tracking-wider text-nowrap">Valid Until</span>
                </div>
                <p className="font-black text-[9px] sm:text-xs text-white">
                  {new Date(validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </p>
              </div>
            </div>

            {/* Total Amount */}
            <div className="relative overflow-hidden p-2 sm:p-3 bg-white/10 backdrop-blur-md rounded-lg sm:rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="p-1 sm:p-1.5 rounded-md lg:rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg">
                    <IndianRupee className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-white" />
                  </div>
                  <span className="text-[9px] sm:text-xs font-black text-white/80 uppercase tracking-widest">Total Amount</span>
                </div>
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-[10px] sm:text-sm font-black text-white/50 tracking-tighter">₹</span>
                  <span className="text-lg sm:text-2xl font-black text-white tracking-tight">{amount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Completed Status */}
        {paymentCompleted && (
          <div className="relative overflow-hidden rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600"></div>
            <div className="relative p-5 sm:p-6">
              <div className="flex items-start gap-3 sm:gap-4 mb-4">
                <div className="p-2 sm:p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                  <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Payment Successful!</h3>
                  <p className="text-xs sm:text-sm text-green-50">Your transaction has been completed successfully</p>
                </div>
              </div>

              {paymentDetails && (
                <div className="space-y-2 bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4">
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-green-50">Payment ID</span>
                    <span className="font-mono font-semibold text-white">{paymentDetails.paymentId}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-green-50">Order ID</span>
                    <span className="font-mono font-semibold text-white">{paymentDetails.orderId}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-green-50">Amount</span>
                    <span className="font-bold text-white">₹{paymentDetails.amount || amount}</span>
                  </div>
                  {paymentDetails.method && (
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-green-50">Method</span>
                      <span className="capitalize font-semibold text-white">{paymentDetails.method}</span>
                    </div>
                  )}
                  {paymentDetails.time && (
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-green-50">Time</span>
                      <span className="font-semibold text-white">
                        {new Date(paymentDetails.time).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!paymentCompleted && (
          <>
            {/* Payment Mode Selection - Completely Redesigned */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 sm:p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg">
                    <ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                  </div>
                  <h3 className="text-xs md:text-lg font-bold text-gray-900 dark:text-gray-100">
                    Choose Payment Method
                  </h3>
                </div>
                <Badge className="text-[9px] sm:text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-300 dark:border-violet-700">
                  Secure
                </Badge>
              </div>

              {/* Enhanced Payment Method Tabs */}
              <div className="relative p-1.5 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl shadow-inner">
                {/* Sliding background indicator */}
                <div
                  className={`absolute top-1.5 h-[calc(100%-0.75rem)] w-[calc(50%-0.375rem)] rounded-xl shadow-xl transition-all duration-300 ease-out ${paymentMode === 'online'
                    ? 'left-1.5 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600'
                    : 'left-[calc(50%+0.1875rem)] bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600'
                    }`}
                ></div>

                <div className="relative grid grid-cols-2 gap-1.5">
                  {/* Online Payment Option */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('online')}
                    className="relative group px-1.5 sm:px-4 py-2.5 sm:py-3.5 rounded-xl transition-all duration-300"
                  >
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
                      {/* Icon */}
                      <div className="relative">
                        <div className={`p-1.5 rounded-lg transition-all duration-300 ${paymentMode === 'online'
                          ? 'bg-white/20 backdrop-blur-sm shadow-lg'
                          : 'bg-white/5'
                          }`}>
                          <CreditCard className={`h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 transition-colors ${paymentMode === 'online' ? 'text-white' : 'text-gray-400'
                            }`} />
                        </div>
                        {paymentMode === 'online' && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-md">
                            <CheckCircle className="h-2 w-2 text-white fill-green-500" />
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <div className="text-left">
                        <p className={`font-bold text-[11px] sm:text-sm transition-colors ${paymentMode === 'online' ? 'text-white drop-shadow-sm' : 'text-gray-300'
                          }`}>
                          Pay Online
                        </p>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <Zap className={`h-2 w-2 ${paymentMode === 'online' ? 'text-amber-300' : 'text-gray-500'}`} />
                          <span className={`text-[8px] sm:text-[10px] font-semibold ${paymentMode === 'online' ? 'text-amber-200' : 'text-gray-500'
                            }`}>Instant</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Offline Payment Option */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('offline')}
                    className="relative group px-1.5 sm:px-4 py-2.5 sm:py-3.5 rounded-xl transition-all duration-300"
                  >
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
                      {/* Icon */}
                      <div className="relative">
                        <div className={`p-1.5 rounded-lg transition-all duration-300 ${paymentMode === 'offline'
                          ? 'bg-white/20 backdrop-blur-sm shadow-lg'
                          : 'bg-white/5'
                          }`}>
                          <Building2 className={`h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 transition-colors ${paymentMode === 'offline' ? 'text-white' : 'text-gray-400'
                            }`} />
                        </div>
                        {paymentMode === 'offline' && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-md">
                            <CheckCircle className="h-2 w-2 text-white fill-green-500" />
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <div className="text-left">
                        <p className={`font-bold text-[11px] sm:text-sm transition-colors ${paymentMode === 'offline' ? 'text-white drop-shadow-sm' : 'text-gray-300'
                          }`}>
                          Pay Offline
                        </p>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <Receipt className={`h-2 w-2 ${paymentMode === 'offline' ? 'text-gray-300' : 'text-gray-500'}`} />
                          <span className={`text-[8px] sm:text-[10px] font-semibold ${paymentMode === 'offline' ? 'text-gray-200' : 'text-gray-500'
                            }`}>Manual</span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

            </div>

            {/* Offline Payment Fields */}
            {paymentMode === 'offline' && (
              <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-white/[0.02] rounded-xl sm:rounded-2xl border border-white/10">
                {/* Payment Amount Display */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 text-purple-300">
                    <div className="p-1 rounded-md bg-purple-500 shadow-md">
                      <IndianRupee className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                    </div>
                    Payment Amount
                  </Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={`₹${amount.toLocaleString()}`}
                      readOnly
                      disabled
                      className="h-10 sm:h-11 bg-white/5 border-2 border-white/10 font-bold text-sm sm:text-base cursor-not-allowed text-white"
                    />
                  </div>
                </div>

                {/* Transaction ID Input */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="offlinePaymentId" className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 text-violet-300">
                    <div className="p-1 rounded-md bg-violet-500 shadow-md">
                      <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                    </div>
                    UPI Transaction ID <span className="text-red-500 ml-1">*</span>
                  </Label>
                  <Input
                    id="offlinePaymentId"
                    type="text"
                    value={offlinePaymentId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOfflinePaymentId(value);
                      console.log('📝 Transaction ID entered:', value);

                      // Notify parent component about payment ID change
                      if (onOfflineSelected && value.trim()) {
                        onOfflineSelected({
                          paymentId: value,
                          receiptUrl: receiptPreview
                        });
                      }
                    }}
                    placeholder="e.g., 234567890123"
                    required
                    className="h-10 sm:h-11 font-mono text-xs sm:text-sm bg-white/5 border-2 border-violet-500/30 text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>

                {/* Receipt Upload */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 text-fuchsia-300">
                    <div className="p-1 rounded-md bg-fuchsia-500 shadow-md">
                      <Upload className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                    </div>
                    Upload Payment Receipt <span className="text-red-500 ml-1">*</span>
                  </Label>
                  <div className={`relative border-2 border-dashed rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center transition-all ${receiptPreview
                    ? 'border-green-400/50 bg-gradient-to-br from-green-950/20 to-emerald-950/20'
                    : 'border-fuchsia-500/30 bg-white/[0.02]'
                    }`}>
                    {receiptPreview ? (
                      <div className="space-y-3 sm:space-y-4">
                        <div className="relative inline-block group">
                          <Image
                            src={receiptPreview}
                            alt="Payment receipt preview"
                            width={200}
                            height={200}
                            className="max-h-40 sm:max-h-48 rounded-xl object-contain shadow-xl border-2 border-green-500/50"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            className="absolute -top-2 -right-2 h-7 w-7 sm:h-8 sm:w-8 rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              if (receiptPreview.startsWith('blob:')) {
                                URL.revokeObjectURL(receiptPreview);
                              }
                              setReceiptPreview('');
                              setReceiptFile(null);
                            }}
                          >
                            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-300">
                          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                          <span className="text-xs sm:text-sm font-semibold">Receipt uploaded successfully</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="relative inline-block mb-3">
                          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-fuchsia-500 rounded-full blur-lg opacity-20"></div>
                          <div className="relative p-3 bg-gradient-to-br from-purple-900/30 to-fuchsia-900/30 rounded-full">
                            <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-purple-400" />
                          </div>
                        </div>
                        <div className="flex flex-col items-center space-y-2 sm:space-y-3">
                          <label
                            htmlFor="receiptUploadOffline"
                            className="cursor-pointer px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 hover:from-purple-700 hover:via-violet-700 hover:to-fuchsia-700 text-white font-bold text-xs sm:text-sm transition-all duration-200 shadow-lg hover:shadow-xl"
                          >
                            📸 Choose Receipt File
                          </label>
                          <input
                            id="receiptUploadOffline"
                            type="file"
                            accept="image/*"
                            onChange={handleReceiptUpload}
                            className="hidden"
                          />
                          <p className="text-[10px] sm:text-xs text-purple-400 font-medium">
                            PNG, JPG, JPEG • Max 5MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Online Payment Section */}
            {paymentMode === 'online' && (
              <div className="space-y-3 sm:space-y-4">
                {/* Payment Flow */}
                <div className="p-3 sm:p-4 bg-white/[0.03] border border-white/10 backdrop-blur-sm rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-blue-600 rounded-lg">
                      <Info className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-blue-100">How Online Payment Works</h4>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2.5">
                      <div className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">1</div>
                      <p className="text-[9px] text-gray-400 font-medium">Click the "Pay Securely" button below</p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-bold">2</div>
                      <p className="text-[9px] text-gray-400 font-medium">Complete payment via Razorpay</p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="flex-shrink-0 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-white text-[9px] font-bold">3</div>
                      <p className="text-[9px] text-gray-400 font-medium">Instant confirmation & auto-activation</p>
                    </div>
                  </div>
                </div>

                {/* Security Info */}
                {!isFormComplete ? (
                  <Alert className="border py-2 sm:py-3 border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-amber-500" />
                      <AlertDescription className="text-[9px] sm:text-sm text-amber-500 font-medium">
                        Please complete the application form (upload photo, fill all details) before ensuring online payment.
                      </AlertDescription>
                    </div>
                  </Alert>
                ) : (
                  <Alert className="border py-2 sm:py-3 border-blue-500/30 bg-blue-500/5">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <Lock className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-blue-400" />
                      <AlertDescription className="text-[9px] sm:text-sm text-blue-200">
                        You will be redirected to Razorpay secure payment gateway. Your payment is protected with industry-standard 256-bit encryption and instant confirmation.
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                {/* Online Payment Button */}
                <Button
                  onClick={handleOnlinePayment}
                  disabled={isProcessingPayment || isProcessing || !isFormComplete}
                  className="w-full h-11 sm:h-14 text-xs sm:text-base font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 text-white shadow-xl hover:shadow-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
                >
                  {isProcessingPayment || isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-6 sm:w-6 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4 sm:h-6 sm:w-6" />
                      Pay ₹{amount.toLocaleString()} Securely
                      <Zap className="ml-2 h-4 w-4 sm:h-6 sm:w-6" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Offline Info Alert */}
            {paymentMode === 'offline' && (
              <Alert className="border py-2 sm:py-3 border-white/10 bg-white/[0.02]">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Lock className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-gray-400" />
                  <AlertDescription className="text-[9px] sm:text-sm text-gray-300">
                    Upload your payment receipt and provide UPI transaction ID. Visit the Bus Office with your enrollment ID to complete verification and activate your bus pass.
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
