'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AlertCircle, X, Clock, Bus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Assignment {
  id: string;
  bus_id: string;
  original_driver_uid: string;
  current_driver_uid: string;
  route_id: string;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
}

export default function DriverSwapBanner() {
  const { currentUser } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    fetchActiveAssignment();
  }, [currentUser]);

  const fetchActiveAssignment = async () => {
    if (!currentUser) return;

    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/driver-swap/list-requests', {
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      });

      const data = await response.json();
      
      if (data.success && data.active && data.active.length > 0) {
        // Find assignment where I'm the temp driver
        const tempAssignment = data.active.find(
          (a: Assignment) => a.current_driver_uid === currentUser.uid
        );
        
        if (tempAssignment) {
          setAssignment(tempAssignment);
          setVisible(true);
        }
      }
    } catch (error) {
      console.error('Error fetching active assignment:', error);
    }
  };

  const formatTimeRemaining = (endsAt: string | null) => {
    if (!endsAt) return 'Until revoked';
    
    const now = new Date().getTime();
    const end = new Date(endsAt).getTime();
    const diff = end - now;
    
    if (diff < 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours < 1) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
    }
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''} remaining`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} remaining`;
  };

  if (!assignment || !visible) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 md:p-6 shadow-lg border-b-4 border-blue-800">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 p-2 bg-white/20 rounded-lg">
            <AlertCircle className="h-6 w-6" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="space-y-2">
                <h3 className="text-lg md:text-xl font-bold flex items-center gap-2 flex-wrap">
                  <Bus className="h-5 w-5" />
                  Temporary Assignment Active
                </h3>
                <p className="text-blue-100">
                  You're temporarily driving <span className="font-semibold">Bus {assignment.bus_id}</span>
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full">
                    <Clock className="h-4 w-4" />
                    {formatTimeRemaining(assignment.ends_at)}
                  </div>
                  {assignment.ends_at && (
                    <div className="text-blue-100">
                      Until {new Date(assignment.ends_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link href="/driver/my-swaps">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="bg-white text-blue-600 hover:bg-blue-50 cursor-pointer"
                  >
                    View Details
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setVisible(false)}
                  className="text-white hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}






