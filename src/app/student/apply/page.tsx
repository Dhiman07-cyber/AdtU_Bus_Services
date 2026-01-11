"use client";

import { useAuth } from '@/contexts/auth-context';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from "lucide-react";

export default function StudentApplyPage() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
      return;
    }
    
    // Redirect to main apply page
    if (!loading && currentUser) {
      router.push('/apply');
    }
  }, [currentUser, userData, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
    </div>
  );
}
