import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import PaymentModeSelector from '@/components/PaymentModeSelector';
import { PaymentStepProps } from './types';
import { calculateSessionDates } from '@/lib/payment/application-payment.service';

export default function Step4ServicePayment({
  formData,
  handleInputChange,
  onNext,
  onPrev,
  currentUser,
  calculateTotalFee,
  handleSessionDurationChange,
  deadlineConfig,
  applicationState,
  checkFormCompletion,
  setPaymentCompleted,
  setPaymentDetails,
  setUseOnlinePayment,
  setApplicationState,
  setReceiptFile,
  setReceiptPreview,
  showToast
}: PaymentStepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white mb-1">Service & Payment</h2>
        <p className="text-sm text-slate-400">Review your session details and select a payment method.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 pt-2">
        <div>
          <Label htmlFor="sessionDuration" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2">
            Session Duration
          </Label>
          <Select
            value={formData.sessionInfo.durationYears > 0 ? formData.sessionInfo.durationYears.toString() : "1"}
            onValueChange={handleSessionDurationChange}
            disabled={true}
          >
            <SelectTrigger className="h-10 bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed text-xs">
              <SelectValue placeholder="1 Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Year</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[9px] text-slate-600 mt-1 italic">Duration is fixed to 1 year</p>
        </div>

        <div>
          <Label htmlFor="sessionStartYear" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2">
            Session Start Year <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.sessionInfo.sessionStartYear.toString()}
            onValueChange={(value) => {
              const startYear = parseInt(value);
              const duration = formData.sessionInfo.durationYears || 1;
              const endYear = startYear + duration;
              handleInputChange('sessionInfo.sessionStartYear', startYear);
              handleInputChange('sessionInfo.sessionEndYear', endYear);
            }}
          >
            <SelectTrigger className="h-10 bg-transparent border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-xs">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</SelectItem>
              <SelectItem value={(new Date().getFullYear() + 1).toString()}>{new Date().getFullYear() + 1}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[9px] text-slate-600 mt-1 italic">Year when service begins</p>
        </div>

        <div>
          <Label htmlFor="sessionEndYear" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2">
            Session End Year
          </Label>
          <Input
            type="number"
            id="sessionEndYear"
            value={formData.sessionInfo.sessionEndYear}
            readOnly
            className="h-10 bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed text-xs"
          />
          <p className="text-[9px] text-slate-600 mt-1 italic">Auto-calculated</p>
        </div>
      </div>

      <div className="pt-6">
        <PaymentModeSelector
          isFormComplete={checkFormCompletion()}
          showHeader={false}
          amount={formData.sessionInfo.feeEstimate || calculateTotalFee(formData.sessionInfo.durationYears, formData.shift || 'morning')}
          duration={formData.sessionInfo.durationYears}
          sessionStartYear={formData.sessionInfo.sessionStartYear}
          sessionEndYear={formData.sessionInfo.sessionEndYear}
          validUntil={(deadlineConfig ? calculateSessionDates(
            formData.sessionInfo.sessionStartYear,
            formData.sessionInfo.durationYears,
            deadlineConfig
          ).validUntil : '')}
          userId={currentUser?.uid || ''}
          userName={formData.fullName}
          userEmail={formData.email}
          userPhone={formData.phoneNumber}
          enrollmentId={formData.enrollmentId}
          purpose="new_registration"
          initialPaymentId={formData.paymentInfo.paymentReference}
          initialReceiptPreview={formData.paymentInfo.paymentEvidenceUrl}
          isReadOnly={applicationState === 'submitted'}
          isVerified={applicationState === 'verified'}
          onPaymentComplete={(details) => {
            setPaymentCompleted(true);
            setPaymentDetails(details);
            setUseOnlinePayment(true);
            setApplicationState('verified');
            showToast('Payment successful! Your application is now verified.', 'success');

            handleInputChange('paymentInfo.paymentMode', 'online');
            handleInputChange('paymentInfo.amountPaid', details.amount || calculateTotalFee(formData.sessionInfo.durationYears, formData.shift || 'morning'));
            handleInputChange('paymentInfo.paymentEvidenceProvided', true);
            handleInputChange('paymentInfo.razorpayPaymentId', details.razorpayPaymentId);
            handleInputChange('paymentInfo.razorpayOrderId', details.razorpayOrderId);
            handleInputChange('paymentInfo.paymentStatus', details.paymentStatus || 'success');
            handleInputChange('paymentInfo.paymentMethod', details.paymentMethod || 'card');
            handleInputChange('paymentInfo.paymentTime', details.paymentTime);
          }}
          onOfflineSelected={(data) => {
            setUseOnlinePayment(false);
            setPaymentCompleted(true);
            setApplicationState('verified');
            handleInputChange('paymentInfo.paymentMode', 'offline');
            handleInputChange('paymentInfo.amountPaid', calculateTotalFee(formData.sessionInfo.durationYears, formData.shift || 'morning'));
            if (data.paymentId) {
              handleInputChange('paymentInfo.paymentReference', data.paymentId);
            }
          }}
          onReceiptFileSelect={(file) => {
            setReceiptFile(file);
            const previewUrl = URL.createObjectURL(file);
            setReceiptPreview(previewUrl);
          }}
        />
      </div>

      <div className="pt-6 border-t border-slate-800 flex justify-between">
        <Button onClick={onPrev} variant="ghost" className="text-slate-400 hover:text-white hover:bg-slate-800 h-10 px-6 font-bold transition-all">
          &lt;- Back to previous step
        </Button>
        <Button onClick={onNext} className="bg-white hover:bg-slate-200 text-black font-bold h-10 px-8 rounded-full shadow-lg transition-all hover:scale-105">
          Continue -&gt;
        </Button>
      </div>
    </div>
  );
}
