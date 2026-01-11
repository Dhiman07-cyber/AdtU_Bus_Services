"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, Bus, Info, MapPin, Clock } from "lucide-react";
import { useUserNotifications } from "@/hooks/useUserNotifications";
import NotificationCardV2 from "@/components/NotificationCardV2";
import { Timestamp } from "firebase/firestore";

type TabType = 'all' | 'trip' | 'notice' | 'pickup' | 'dropoff' | 'announcement';

export default function StudentNotificationsPage() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>('all');

  const {
    notifications: allNotifications,
    unreadCount,
    loading,
    markAsRead,
    refresh
  } = useUserNotifications();

  // Filter notifications by type
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') {
      return allNotifications;
    }

    // Filter by type field
    return allNotifications.filter(n => n.type === activeTab);
  }, [allNotifications, activeTab]);

  // Count notifications by type
  const getCountByType = (type: TabType) => {
    if (type === 'all') return allNotifications.length;
    return allNotifications.filter(n => n.type === type).length;
  };



  const getTabIcon = (type: TabType) => {
    switch (type) {
      case 'all': return <Bell className="h-4 w-4" />;
      case 'trip': return <Bus className="h-4 w-4" />;
      case 'notice': return <Info className="h-4 w-4" />;
      case 'pickup': return <MapPin className="h-4 w-4" />;
      case 'dropoff': return <MapPin className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };


  if (!currentUser || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 dark:bg-gray-950 relative overflow-hidden">
        {/* Animated background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <div className="text-center space-y-12 relative z-10">
          {/* Premium spinner with gradient ring */}
          <div className="relative flex items-center justify-center">
            {/* Gradient ring structure */}
            <div className="absolute w-18 h-18 rounded-full bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 animate-spin"></div>
            <div className="absolute w-16 h-16 rounded-full bg-gray-900 dark:bg-gray-950"></div>

            {/* Center icon with pulse effect */}
            <div className="relative animate-pulse">
              <Bell className="h-8 w-8 text-purple-500 dark:text-purple-400" />
            </div>
          </div>

          {/* Loading text with gradient */}
          <div className="space-y-3">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 bg-clip-text text-transparent animate-pulse">
              Loading Notifications
            </h3>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Preparing your notification center...
            </p>

            {/* Loading dots animation */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20 dark:from-gray-950 dark:via-gray-950 dark:to-gray-950 h-screen">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 pt-20 pb-4 md:pt-24 md:pb-6 min-h-screen">
        {/* Compact Header with Gradient */}
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl mb-4 md:mb-6 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-90"></div>
          <div className="relative p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
                  <Bell className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg md:text-2xl font-bold text-white">
                    Notifications
                  </h1>
                  <p className="text-[10px] md:text-sm text-blue-100 mt-0.5">
                    Stay updated with announcements and alerts
                  </p>
                </div>
              </div>
              {allNotifications.length > 0 && (
                <Badge className="bg-white/20 text-white border-white/30 text-xs md:text-sm px-2 md:px-3 py-1">
                  {allNotifications.length}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="all" value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)} className="space-y-3 md:space-y-4">
          {/* Compact Tab List */}
          <TabsList className="grid w-full grid-cols-5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-xl p-2 sm:p-1 shadow-md min-h-[4rem] sm:min-h-[2.5rem]">
            <TabsTrigger
              value="all"
              className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-1 rounded-lg transition-all"
              style={activeTab === 'all' ? {
                background: 'linear-gradient(to bottom right, #2563eb, #9333ea)',
                color: 'white',
                boxShadow: 'none'
              } : {}}
            >
              <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-[9px] sm:text-xs font-medium">All</span>
              {getCountByType('all') > 0 && (
                <span className="hidden sm:inline text-[10px]">({getCountByType('all')})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="trip"
              className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-1 rounded-lg transition-all"
              style={activeTab === 'trip' ? {
                background: 'linear-gradient(to bottom right, #2563eb, #9333ea)',
                color: 'white',
                boxShadow: 'none'
              } : {}}
            >
              <Bus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-[9px] sm:text-xs font-medium">Trip</span>
              {getCountByType('trip') > 0 && (
                <span className="hidden sm:inline text-[10px]">({getCountByType('trip')})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="notice"
              className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-1 rounded-lg transition-all"
              style={activeTab === 'notice' ? {
                background: 'linear-gradient(to bottom right, #2563eb, #9333ea)',
                color: 'white',
                boxShadow: 'none'
              } : {}}
            >
              <Info className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-[9px] sm:text-xs font-medium">Notice</span>
              {getCountByType('notice') > 0 && (
                <span className="hidden sm:inline text-[10px]">({getCountByType('notice')})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="pickup"
              className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-1 rounded-lg transition-all"
              style={activeTab === 'pickup' ? {
                background: 'linear-gradient(to bottom right, #2563eb, #9333ea)',
                color: 'white',
                boxShadow: 'none'
              } : {}}
            >
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-[9px] sm:text-xs font-medium">Pickup</span>
              {getCountByType('pickup') > 0 && (
                <span className="hidden sm:inline text-[10px]">({getCountByType('pickup')})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="dropoff"
              className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-1 rounded-lg transition-all"
              style={activeTab === 'dropoff' ? {
                background: 'linear-gradient(to bottom right, #2563eb, #9333ea)',
                color: 'white',
                boxShadow: 'none'
              } : {}}
            >
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-[9px] sm:text-xs font-medium">Drop</span>
              {getCountByType('dropoff') > 0 && (
                <span className="hidden sm:inline text-[10px]">({getCountByType('dropoff')})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-2 md:space-y-3">
            {filteredNotifications.length === 0 ? (
              <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
                <CardContent className="py-12 md:py-16 text-center">
                  <div className="inline-flex p-3 md:p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl mb-3 md:mb-4">
                    <div className="text-gray-600 dark:text-gray-400">
                      {getTabIcon(activeTab)}
                    </div>
                  </div>
                  <p className="text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {activeTab === 'all' ? 'No notifications' : `No ${activeTab} notifications`}
                  </p>
                  <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-500">
                    {activeTab === 'all' ? 'You\'ll see all notifications here when available' : `You'll see ${activeTab} updates here when available`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4 md:space-y-6">
                {filteredNotifications.map((notification) => (
                  <NotificationCardV2
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}
