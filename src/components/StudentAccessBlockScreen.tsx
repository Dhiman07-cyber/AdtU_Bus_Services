"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, XCircle, Phone, Mail, CreditCard, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getDaysUntilHardDelete, getBlockingMessage, getContactInfo, getHardDeleteDate } from '@/lib/utils/renewal-utils';

interface StudentAccessBlockScreenProps {
  validUntil: string | null;
  studentName: string;
  onLogout?: () => void;
  deadlineConfig?: any;
}

/**
 * Full-screen block overlay for students whose access is blocked
 * Shown after academic year deadline (June 30th by default) if student hasn't renewed
 */
export default function StudentAccessBlockScreen({
  validUntil,
  studentName,
  onLogout,
  deadlineConfig
}: StudentAccessBlockScreenProps) {
  const router = useRouter();
  const daysUntilDelete = getDaysUntilHardDelete(validUntil, null, deadlineConfig);
  const message = getBlockingMessage(validUntil, null, deadlineConfig);
  const contactInfo = getContactInfo(); // Contact info is static/default for now unless we update getContactInfo signature too
  const hardDeleteDate = getHardDeleteDate(validUntil, null, deadlineConfig);
  const hardDeleteDateFormatted = hardDeleteDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Prevent background scrolling while the overlay is open
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyClass = document.body.className;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Mark body so layout can hide navbar
    document.body.classList.add('block-overlay');

    // Hide StudentLayout bottom nav
    const bottomNav = document.getElementById('student-bottom-nav');
    if (bottomNav) bottomNav.setAttribute('data-hidden', 'true');

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.className = previousBodyClass;
      // Restore bottom nav
      if (bottomNav) bottomNav.removeAttribute('data-hidden');
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] bg-background/90 backdrop-blur-sm flex items-start justify-center overflow-y-auto overscroll-contain pt-20 pb-8 px-4">
      <Card className="max-w-lg w-full border-red-500 border-2 shadow-2xl flex flex-col bg-zinc-900">
        <CardHeader className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500 rounded-full">
              <XCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-red-700 dark:text-red-400">
                Bus Service Expired
              </CardTitle>
              <CardDescription className="text-red-600 dark:text-red-300 mt-1">
                Track Bus access is restricted
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Main Message */}
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                  Dear {studentName},
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>


          {/* Contact Information - Dynamic from Config */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-3">
              Contact Admin Office Immediately
            </h3>
            <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>{contactInfo.officeName}: {contactInfo.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>Email: {contactInfo.email}</span>
              </div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
              {contactInfo.visitInstructions}
            </p>
          </div>

          {/* Warning - Dynamic Threshold */}
          {daysUntilDelete > 0 && daysUntilDelete <= (deadlineConfig?.urgentWarningThreshold?.days || 15) && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <p className="font-semibold text-sm">
                  URGENT: Only {daysUntilDelete} days remaining before permanent deletion!
                </p>
              </div>
              <p className="text-xs text-red-600 dark:text-red-300 mt-2">
                After {hardDeleteDateFormatted}, your account and all associated data will be permanently deleted and cannot be recovered.
              </p>
            </div>
          )}

          {/* Renewal CTA */}
          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              <h3 className="font-bold text-green-800 dark:text-green-200">
                Renew Your Service Online Now!
              </h3>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300 mb-3">
              You can now renew your bus service online instantly. Complete payment and regain access to Track Bus feature immediately.
            </p>
            <Button
              onClick={() => router.push('/student/renew-services')}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg"
              size="lg"
            >
              <CreditCard className="mr-2 h-5 w-5" />
              Renew Service Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {onLogout && (
              <Button
                variant="outline"
                onClick={onLogout}
                className="flex-1"
              >
                Sign Out
              </Button>
            )}
            <Button
              onClick={() => router.push('/student')}
              variant="outline"
              className="flex-1"
            >
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
