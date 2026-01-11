"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/contexts/toast-context";
import { useAuth } from "@/contexts/auth-context";
import { Save, X, Calendar as CalendarIcon } from "lucide-react";
import { Timestamp } from "firebase/firestore";

interface NotificationDoc {
  id: string;
  type: 'trip' | 'notice' | 'pickup' | 'dropoff';
  title: string;
  message: string;
  audience: {
    scope: 'all' | 'shift' | 'route';
    shift: string | null;
    routes: string[];
  };
  routesSummary?: any[];
  author: any;
  createdAt: any;
  startDate?: any;
  endDate?: any;
}

interface EditNotificationModalProps {
  open: boolean;
  onClose: () => void;
  notification: NotificationDoc | null;
  onSuccess: () => void;
}

export default function EditNotificationModal({ open, onClose, notification, onSuccess }: EditNotificationModalProps) {
  const { currentUser } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'notice' | 'pickup' | 'dropoff' | 'trip'>('notice');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audienceScope, setAudienceScope] = useState<'all' | 'shift' | 'route'>('all');
  const [shift, setShift] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load notification data when modal opens
  useEffect(() => {
    if (notification) {
      setType(notification.type);
      setTitle(notification.title);
      setMessage(notification.message);
      setAudienceScope(notification.audience.scope);
      setShift(notification.audience.shift);

      // Convert Firestore timestamps to date strings
      if (notification.startDate) {
        let startDateObj: Date;
        if (notification.startDate instanceof Timestamp) {
          startDateObj = notification.startDate.toDate();
        } else if (notification.startDate.seconds) {
          startDateObj = new Date(notification.startDate.seconds * 1000);
        } else {
          startDateObj = new Date(notification.startDate);
        }
        setStartDate(startDateObj.toISOString().split('T')[0]);
      }

      if (notification.endDate) {
        let endDateObj: Date;
        if (notification.endDate instanceof Timestamp) {
          endDateObj = notification.endDate.toDate();
        } else if (notification.endDate.seconds) {
          endDateObj = new Date(notification.endDate.seconds * 1000);
        } else {
          endDateObj = new Date(notification.endDate);
        }
        setEndDate(endDateObj.toISOString().split('T')[0]);
      }
    }
  }, [notification]);

  const handleSubmit = async () => {
    if (!currentUser || !notification) return;

    if (!title.trim() || !message.trim()) {
      addToast('Please fill in all required fields', 'error');
      return;
    }

    try {
      setLoading(true);

      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/notifications/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          notificationId: notification.id,
          type,
          title,
          message,
          audience: {
            scope: audienceScope,
            shift: shift,
            routes: notification.audience.routes
          },
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update notification');
      }

      addToast('Notification updated successfully!', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating notification:', error);
      addToast(error.message || 'Failed to update notification', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        onWheel={(e) => e.stopPropagation()}
        className="!max-w-7xl max-h-[90vh] overflow-y-auto z-[9999] overscroll-contain touch-pan-y"
      >
        <DialogHeader>
          <DialogTitle>Edit Notification</DialogTitle>
          <DialogDescription>
            Update the notification details below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="edit-type" className="text-base font-semibold">Notification Type</Label>
            <Select value={type} onValueChange={(value: any) => setType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notice">Notice</SelectItem>
                <SelectItem value="pickup">Pickup Update</SelectItem>
                <SelectItem value="dropoff">Dropoff Assignment</SelectItem>
                <SelectItem value="trip">Trip</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audience Selection */}
          <div className="space-y-2">
            <Label htmlFor="edit-audience" className="text-base font-semibold">Audience</Label>
            <Select value={audienceScope} onValueChange={(value: any) => setAudienceScope(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Students</SelectItem>
                <SelectItem value="shift">Specific Shift</SelectItem>
                <SelectItem value="route">Specific Route(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audienceScope === 'shift' && (
            <div className="space-y-2">
              <Label htmlFor="edit-shift">Select Shift</Label>
              <Select value={shift || undefined} onValueChange={setShift}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning Shift</SelectItem>
                  <SelectItem value="evening">Evening Shift</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-base font-semibold">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              maxLength={100}
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-startDate" className="flex items-center gap-2 text-base font-semibold">
                <CalendarIcon className="h-4 w-4" />
                Start Date
              </Label>
              <Input
                id="edit-startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-endDate" className="flex items-center gap-2 text-base font-semibold">
                <CalendarIcon className="h-4 w-4" />
                End Date (Expiry)
              </Label>
              <Input
                id="edit-endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Message Editor */}
          <div className="space-y-2">
            <Label htmlFor="edit-message" className="text-base font-semibold">Message</Label>
            <Textarea
              id="edit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message here..."
              rows={12}
              className="font-mono text-sm"
              maxLength={2000}
            />
            <p className="text-xs text-gray-500 mt-1">
              {message.length} / 2000 characters
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Updating...' : 'Update Notification'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

