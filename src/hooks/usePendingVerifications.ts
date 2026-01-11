/**
 * Custom hook for moderators to track pending verifications
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Application } from '@/lib/types/application';

export function usePendingVerifications() {
  const { currentUser, userData } = useAuth();
  const [verifications, setVerifications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser || !userData || userData.role !== 'moderator') {
      setLoading(false);
      return;
    }

    loadVerifications();
    
    // Poll every 30 seconds for new verifications
    const interval = setInterval(loadVerifications, 30000);
    
    return () => clearInterval(interval);
  }, [currentUser, userData]);

  const loadVerifications = async () => {
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/moderators/verifications/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setVerifications(data.verifications || []);
      }
    } catch (err: any) {
      console.error('Error loading verifications:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshVerifications = () => {
    loadVerifications();
  };

  return {
    verifications,
    loading,
    error,
    refreshVerifications,
    pendingCount: verifications.length
  };
}

