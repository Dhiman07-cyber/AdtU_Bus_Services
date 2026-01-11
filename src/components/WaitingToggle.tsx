"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase-client';
import { v4 as uuidv4 } from 'uuid';

interface WaitingToggleProps {
  studentId: string;
  busId: string;
  routeId: string;
  stopName: string;
}

export function WaitingToggle({ studentId, busId, routeId, stopName }: WaitingToggleProps) {
  const { currentUser } = useAuth();
  const [isWaiting, setIsWaiting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waitingFlagId, setWaitingFlagId] = useState<string | null>(null);

  // Check initial waiting status
  useEffect(() => {
    const fetchWaitingStatus = async () => {
      try {
        // Check Supabase for existing waiting flag
        const { data, error } = await supabase
          .from('waiting_flags')
          .select('*')
          .eq('student_uid', studentId)
          .eq('bus_id', busId)
          .eq('status', 'waiting')
          .single();

        if (error) {
          throw new Error(error.message);
        }

        if (data) {
          setIsWaiting(true);
          setWaitingFlagId(data.id);
        }
      } catch (err: any) {
        console.error("Error fetching waiting status:", err);
        setError("Failed to fetch waiting status");
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchWaitingStatus();
    }
  }, [studentId, busId]);



  const handleToggle = async () => {
    if (!currentUser?.email) return;

    setLoading(true);
    setError(null);

    try {
      if (isWaiting) {
        // Cancel waiting flag in Supabase
        const { error } = await supabase
          .from('waiting_flags')
          .update({ status: 'cancelled' })
          .eq('id', waitingFlagId);

        if (error) {
          throw new Error(error.message);
        }

        setIsWaiting(false);
      } else {
        // Create waiting flag in Supabase
        const newFlagId = uuidv4();
        const { error } = await supabase
          .from('waiting_flags')
          .insert({
            id: newFlagId,
            student_uid: studentId,
            bus_id: busId,
            route_id: routeId,
            stop_name: stopName,
            status: 'waiting',
            created_at: new Date().toISOString()
          });

        if (error) {
          throw new Error(error.message);
        }

        setIsWaiting(true);
        setWaitingFlagId(newFlagId);
      }
    } catch (err: any) {
      console.error("Error updating waiting status:", err);
      setError("Failed to update waiting status: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500"></div>
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2">
      <Button
        variant={isWaiting ? "default" : "outline"}
        onClick={handleToggle}
        disabled={loading}
        className="flex items-center space-x-2"
      >
        {isWaiting ? (
          <>
            <CheckCircle className="h-4 w-4" />
            <span>Waiting for Bus</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4" />
            <span>Mark as Waiting</span>
          </>
        )}
      </Button>

      {error && (
        <div className="text-sm text-red-500 flex items-center space-x-1">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Click to indicate when you're ready to board the bus at {stopName}
      </p>
    </div>
  );
}