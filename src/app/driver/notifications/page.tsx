"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Bell, Plus, Megaphone, MapPin, MapPinOff, Sparkles, Zap } from "lucide-react";
import { useToast } from "@/contexts/toast-context";
import { useAuth } from "@/contexts/auth-context";
import NotificationFormV2 from "@/components/NotificationFormV2";
import NotificationCardV2 from "@/components/NotificationCardV2";
import { useUserNotifications } from "@/hooks/useUserNotifications";

export default function DriverNotificationsPage() {
  const router = useRouter();
  const { currentUser, userData, loading: authLoading } = useAuth();
  const { addToast } = useToast();

  const {
    notifications: allNotifications,
    unreadCount,
    loading,
    markAsRead,
    refresh
  } = useUserNotifications();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'notifications' | 'notice' | 'pickup' | 'dropoff'>('notifications');

  // Filter notifications by type for tabs
  const filteredNotifications = useMemo(() => {
    if (activeSection === 'notifications') return allNotifications;
    // Map internal Tab name to NotificationType
    const sectionToType: Record<string, string> = {
      'notice': 'notice',
      'pickup': 'pickup',
      'dropoff': 'dropoff'
    };
    return allNotifications.filter((n: any) => n.type === sectionToType[activeSection]);
  }, [allNotifications, activeSection]);

  // Check authorization
  useEffect(() => {
    if (!authLoading && userData && userData.role !== 'driver') {
      router.push(`/${userData.role}`);
    }
  }, [userData, router, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 dark:bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <div className="text-center space-y-12 relative z-10">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-spin"></div>
            <div className="absolute w-16 h-16 rounded-full bg-gray-900 dark:bg-gray-950"></div>
            <div className="relative animate-pulse">
              <Bell className="h-8 w-8 text-blue-500 dark:text-blue-400" />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-pulse">
              Loading Notifications
            </h3>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Preparing your notification center...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-blue-950 dark:to-indigo-950 pb-24 md:pb-12 text-gray-900 dark:text-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
        {/* Premium Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-1">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-50 blur-3xl" />
          <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl p-4 sm:p-8 md:p-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
              <div className="space-y-3 sm:space-y-4 min-w-0 flex-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-2 sm:p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg animate-float flex-shrink-0">
                    <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                      Notifications
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 uppercase tracking-widest font-black">
                      Official Broadcast Center
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-black bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-tighter">
                    <Bell className="h-3 w-3 mr-1" />
                    Driver Access
                  </Badge>
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-black uppercase tracking-wider animate-pulse">
                      <Zap className="h-3 w-3 mr-1" />
                      {unreadCount} New
                    </Badge>
                  )}
                </div>
              </div>

              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="h-12 sm:h-14 px-6 sm:px-8 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-black uppercase tracking-[0.2em] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all text-xs sm:text-sm rounded-2xl w-full md:w-auto"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                New Broadcast
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-1.5 shadow-sm">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {[
              { id: 'notifications', label: 'All', icon: Bell },
              { id: 'notice', label: 'Notices', icon: Megaphone },
              { id: 'pickup', label: 'Pickup', icon: MapPin },
              { id: 'dropoff', label: 'Dropoff', icon: MapPinOff },
            ].map((tab) => {
              const Icon = tab.icon;
              const count = tab.id === 'notifications'
                ? allNotifications.length
                : allNotifications.filter(n => n.type === tab.id).length;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as any)}
                  className={`px-3 sm:px-4 py-2.5 rounded-xl font-black transition-all duration-300 flex items-center justify-center gap-2 ${activeSection === tab.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md scale-[1.02]'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs uppercase tracking-widest">{tab.label}</span>
                  {count > 0 && (
                    <span className={`text-[10px] ${activeSection === tab.id ? 'opacity-70' : 'text-slate-400'}`}>({count})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications List */}
        <div className="space-y-4 md:space-y-6">
          {filteredNotifications.length === 0 ? (
            <Card className="bg-white/50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 rounded-3xl py-24 text-center border-dashed">
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center border border-gray-100 dark:border-gray-700">
                  <Bell className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-400 italic">Silence is Golden</h3>
                  <p className="text-slate-400 text-xs font-bold mt-1">
                    No broadcasts found for this category
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            filteredNotifications.map((notification) => (
              <NotificationCardV2
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onRefresh={refresh}
              />
            ))
          )}
        </div>

        {/* Create Notification Form (Self-managed Modal) */}
        <NotificationFormV2
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSuccess={() => {
            setCreateDialogOpen(false);
            refresh();
          }}
        />
      </div>
    </div>
  );
}
