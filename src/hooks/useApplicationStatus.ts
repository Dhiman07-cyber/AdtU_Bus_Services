/**
 * Custom hook for managing application status
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Application } from '@/lib/types/application';

export function useApplicationStatus() {
  const { currentUser } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    loadApplication();
  }, [currentUser]);

  const loadApplication = async () => {
    try {
      setLoading(true);
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/my-application', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setApplication(data.application);
      } else {
        setApplication(null);
      }
    } catch (err: any) {
      console.error('Error loading application:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshApplication = () => {
    loadApplication();
  };

  return {
    application,
    loading,
    error,
    refreshApplication,
    hasApplication: !!application,
    applicationState: application?.state || 'noDoc'
  };
}

