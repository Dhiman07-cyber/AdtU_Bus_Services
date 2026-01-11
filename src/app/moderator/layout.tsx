"use client";

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ModeratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for auth to fully load before making decisions
    if (loading) {
      return;
    }

    // If no user, redirect to login
    if (!currentUser) {
      router.push('/login');
      return;
    }

    // Wait for userData to be available (it may load after currentUser)
    if (!userData) {
      // Give it a moment to load
      const timeout = setTimeout(() => {
        // If still no userData after waiting, it's a problem
        if (!userData) {
          console.warn('ModeratorLayout: userData not available');
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }

    // If user has wrong role, redirect to their proper dashboard
    if (userData.role !== 'moderator') {
      router.push(`/${userData.role}`);
      return;
    }

    // All checks passed, mark as ready
    setIsReady(true);
  }, [currentUser, userData, loading, router]);

  // Show loading spinner while auth is loading OR while waiting for userData
  if (loading || (!isReady && currentUser && !userData)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // If not ready and we have user data but wrong role, don't render
  if (!currentUser || (userData && userData.role !== 'moderator')) {
    return null;
  }

  return <>{children}</>;
}
