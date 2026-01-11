"use client";

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';

interface StudentAuthWrapperProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that ensures user is a student
 * NO LONGER blocks access for expired students - they can access dashboard
 * Expiry check is now only on Track Bus page
 */
export default function StudentAuthWrapper({ children }: StudentAuthWrapperProps) {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If not a student, redirect to appropriate dashboard
    if (!loading && userData && userData.role !== 'student') {
      router.push(`/${userData.role}`);
    }
  }, [userData, loading, router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Not authenticated
  if (!userData) {
    return null; // Auth context will handle redirect
  }

  // Show content regardless of expiry status
  return <>{children}</>;
}
