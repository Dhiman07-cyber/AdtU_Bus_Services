"use client";

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Bell,
  Plus,
  Megaphone,
  MapPin,
  MapPinOff,
  Inbox,
  Send,
  Eye,
  Archive,
  Loader2
} from "lucide-react";
import { useToast } from "@/contexts/toast-context";
import { useAuth } from "@/contexts/auth-context";
import { useUserNotifications } from '@/hooks/useUserNotifications';
import NotificationFormV2 from "@/components/NotificationFormV2";
import NotificationCardV2 from "@/components/NotificationCardV2";

type TabType = 'all' | 'unread' | 'sent' | 'archived';

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { currentUser, userData } = useAuth();
  const { addToast } = useToast();

  // Use the user-specific notification hook
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    deleteGlobally,
    editNotification,
    refresh
  } = useUserNotifications();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  // Automatically mark all received notifications as read when visiting the page or switching tabs
  useEffect(() => {
    if (loading || !currentUser) return;

    const markAllVisibleAsRead = async () => {
      const unreadReceived = notifications.filter(n =>
        !n.isRead &&
        !n.isDeletedGlobally &&
        n.sender.userId !== currentUser.uid
      );

      if (unreadReceived.length > 0) {
        // Mark each as read
        const promises = unreadReceived.map(n => markAsRead(n.id));
        try {
          await Promise.all(promises);
          // Don't show toast for automatic marking to avoid spam
        } catch (err) {
          console.error('Error auto-marking notifications as read:', err);
        }
      }
    };

    // Only auto-mark if we are in 'all' or 'unread' tabs
    if (activeTab === 'all' || activeTab === 'unread') {
      markAllVisibleAsRead();
    }
  }, [activeTab, loading, notifications, currentUser, markAsRead]);

  // Filter notifications based on active tab
  const getFilteredNotifications = () => {
    switch (activeTab) {
      case 'all':
        // Exclude sent notifications from ALL tab (show only received)
        return notifications.filter(n => n.sender.userId !== currentUser?.uid);
      case 'unread':
        // Exclude sent notifications from UNREAD tab (show only received unread)
        return notifications.filter(n => !n.isRead && !n.isDeletedGlobally && n.sender.userId !== currentUser?.uid);
      case 'sent':
        // Show only sent notifications
        return notifications.filter(n => n.sender.userId === currentUser?.uid);
      case 'archived':
        return notifications.filter(n => n.isDeletedGlobally);
      default:
        return notifications;
    }
  };

  const filteredNotifications = getFilteredNotifications();

  // Count notifications by type
  const receivedNotifications = notifications.filter(n => n.sender.userId !== currentUser?.uid);
  const unreadNotifications = notifications.filter(n => !n.isRead && !n.isDeletedGlobally && n.sender.userId !== currentUser?.uid);
  const sentNotifications = notifications.filter(n => n.sender.userId === currentUser?.uid);
  const archivedNotifications = notifications.filter(n => n.isDeletedGlobally);

  // Handlers
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsRead(notificationId);
      addToast('Marked as read', 'success');
    } catch (error) {
      addToast('Failed to mark as read', 'error');
    }
  };

  const handleEdit = async (notificationId: string, newContent: string) => {
    try {
      await editNotification(notificationId, newContent);
      addToast('Notification updated successfully', 'success');
    } catch (error) {
      addToast('Failed to update notification', 'error');
    }
  };

  const handleDeleteGlobally = async (notificationId: string) => {
    try {
      await deleteGlobally(notificationId);
      addToast('Notification deleted for everyone', 'success');
    } catch (error) {
      addToast('Failed to delete notification', 'error');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">Error loading notifications</p>
          <Button onClick={refresh} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12 py-4 px-3 sm:px-4 lg:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Bell className="h-5 w-5" />
              Notifications
            </h1>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Manage and send notifications to all users
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Notification
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-9">
            <TabsTrigger value="all" className="flex items-center gap-1.5 text-xs">
              <Inbox className="h-3.5 w-3.5" />
              All
              {receivedNotifications.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] py-0">
                  {receivedNotifications.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex items-center gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" />
              Unread
              {unreadNotifications.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[10px] py-0">
                  {unreadNotifications.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex items-center gap-1.5 text-xs">
              <Send className="h-3.5 w-3.5" />
              Sent
              {sentNotifications.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] py-0">
                  {sentNotifications.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="archived" className="flex items-center gap-1.5 text-xs">
              <Archive className="h-3.5 w-3.5" />
              Archived
              {archivedNotifications.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] py-0">
                  {archivedNotifications.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value={activeTab} className="mt-3">
            {filteredNotifications.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center">
                    <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                      {activeTab === 'unread' ? (
                        <Bell className="h-5 w-5 text-gray-400" />
                      ) : activeTab === 'sent' ? (
                        <Send className="h-5 w-5 text-gray-400" />
                      ) : activeTab === 'archived' ? (
                        <Archive className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Inbox className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {activeTab === 'unread'
                        ? 'No unread notifications'
                        : activeTab === 'sent'
                          ? 'No sent notifications'
                          : activeTab === 'archived'
                            ? 'No archived notifications'
                            : 'No notifications yet'}
                    </p>
                    {activeTab === 'all' && (
                      <Button onClick={() => setCreateDialogOpen(true)} className="h-8 text-xs">
                        Create your first notification
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <NotificationCardV2
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onEdit={handleEdit}
                    onDeleteGlobally={handleDeleteGlobally}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create Notification Dialog */}
        <NotificationFormV2
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSuccess={() => {
            refresh();
            setCreateDialogOpen(false);
          }}
        />
      </div>
    </div>
  );
}
