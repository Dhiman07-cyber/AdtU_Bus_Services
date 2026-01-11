"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Send, Eye, X } from "lucide-react";
import { getTemplate, insertDropoffSummary, type NotificationType, type AudienceScope, type ShiftType, type DropoffAssignment } from "@/data/notification_templates";
import { getAllRoutes } from "@/lib/dataService";
import { Route } from "@/lib/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import DropoffMatrix from "./DropoffMatrix";

interface CreateNotificationModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateNotificationModal({ open, onClose }: CreateNotificationModalProps) {
  const { currentUser, userData } = useAuth();
  const { addToast } = useToast();

  // Form state
  const [type, setType] = useState<NotificationType>('notice');
  const [audienceScope, setAudienceScope] = useState<AudienceScope>('all');
  const [shift, setShift] = useState<ShiftType>(null);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sendMode, setSendMode] = useState<'aggregated' | 'per-route'>('aggregated');
  const [sendFCM, setSendFCM] = useState(false);

  // Dropoff matrix state
  const [dropoffAssignments, setDropoffAssignments] = useState<DropoffAssignment[]>([]);

  // UI state
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  // Load routes on mount
  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const routesData = await getAllRoutes();
        setRoutes(routesData);
      } catch (error) {
        console.error('Error loading routes:', error);
      }
    };
    const fetchBuses = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'buses'));
        const busesData = snapshot.docs.map(doc => ({
          id: doc.id,
          busId: doc.id,
          ...doc.data()
        }));
        setBuses(busesData);
      } catch (error) {
        console.error('Error loading buses:', error);
      }
    };
    fetchRoutes();
    fetchBuses();
  }, []);

  // Load template when type changes
  useEffect(() => {
    if (!userData) return;

    const employeeId = (userData as any).employeeId || 'STAFF';
    const template = getTemplate(type, userData.name, employeeId);

    setTitle(template.title);
    setMessage(template.message);

    // Reset audience when switching types
    setAudienceScope('all');
    setShift(null);
    setSelectedRoutes([]);
    setDropoffAssignments([]);
  }, [type, userData]);

  // Update message when dropoff assignments change
  useEffect(() => {
    if (type === 'dropoff' && dropoffAssignments.length > 0) {
      const employeeId = (userData as any)?.employeeId || 'STAFF';
      const template = getTemplate('dropoff', userData?.name || 'Staff', employeeId);
      const updatedMessage = insertDropoffSummary(template.message, dropoffAssignments);
      setMessage(updatedMessage);
    }
  }, [dropoffAssignments, type, userData]);

  // Save draft to localStorage
  useEffect(() => {
    if (!open) return;

    const draft = {
      type,
      audienceScope,
      shift,
      selectedRoutes,
      title,
      message,
      sendMode,
      dropoffAssignments,
      timestamp: Date.now()
    };

    localStorage.setItem('notification_draft', JSON.stringify(draft));
  }, [type, audienceScope, shift, selectedRoutes, title, message, sendMode, dropoffAssignments, open]);

  // Load draft from localStorage on open
  useEffect(() => {
    if (open) {
      const savedDraft = localStorage.getItem('notification_draft');
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          // Only load if less than 1 hour old
          if (Date.now() - draft.timestamp < 3600000) {
            setType(draft.type || 'notice');
            setAudienceScope(draft.audienceScope || 'all');
            setShift(draft.shift || null);
            setSelectedRoutes(draft.selectedRoutes || []);
            setTitle(draft.title || '');
            setMessage(draft.message || '');
            setSendMode(draft.sendMode || 'aggregated');
            setDropoffAssignments(draft.dropoffAssignments || []);
          }
        } catch (e) {
          console.error('Error loading draft:', e);
        }
      }
    }
  }, [open]);

  const handleClose = () => {
    // Keep draft in localStorage for next time
    onClose();
  };

  const handlePreview = async () => {
    // Fetch recipient count from server
    try {
      const idToken = await currentUser?.getIdToken();
      const response = await fetch('/api/notifications/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          audienceScope,
          shift,
          routes: selectedRoutes
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRecipientCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching recipient count:', error);
    }

    setShowPreview(true);
  };

  const handleSend = async () => {
    if (!userData || !currentUser) {
      addToast('You must be logged in to send notifications', 'error');
      return;
    }

    // Validation
    if (!title.trim()) {
      addToast('Please enter a title', 'error');
      return;
    }

    if (!message.trim()) {
      addToast('Please enter a message', 'error');
      return;
    }

    if (audienceScope === 'shift' && !shift) {
      addToast('Please select a shift', 'error');
      return;
    }

    if (audienceScope === 'route' && selectedRoutes.length === 0) {
      addToast('Please select at least one route', 'error');
      return;
    }

    if (type === 'dropoff' && dropoffAssignments.length === 0) {
      addToast('Please configure at least one dropoff assignment', 'error');
      return;
    }

    setLoading(true);

    try {
      const idToken = await currentUser.getIdToken();

      const payload = {
        type,
        title,
        message,
        audience: {
          scope: audienceScope,
          shift: audienceScope === 'shift' ? shift : null,
          routes: audienceScope === 'route' ? selectedRoutes : []
        },
        sendMode: type === 'dropoff' ? sendMode : 'aggregated',
        sendFCM: type === 'trip' ? sendFCM : false,
        routesSummary: type === 'dropoff' ? dropoffAssignments : []
      };

      const response = await fetch('/api/notifications/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      const result = await response.json();

      addToast(
        result.count
          ? `Notification sent successfully to ${result.count} recipient(s)!`
          : 'Notification sent successfully!',
        'success'
      );

      // Clear draft
      localStorage.removeItem('notification_draft');

      // Reset form
      setShowPreview(false);
      handleClose();

    } catch (error) {
      console.error('Error sending notification:', error);
      addToast(error instanceof Error ? error.message : 'Failed to send notification', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    if (!title.trim() || !message.trim()) return false;
    if (audienceScope === 'shift' && !shift) return false;
    if (audienceScope === 'route' && selectedRoutes.length === 0) return false;
    if (type === 'dropoff' && dropoffAssignments.length === 0) return false;
    return true;
  };

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent
          onWheel={(e) => e.stopPropagation()}
          className="!max-w-7xl max-h-[90vh] overflow-y-auto z-[9999] overscroll-contain touch-pan-y"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Create Notification
            </DialogTitle>
            <DialogDescription>
              Send in-app notifications to students. Drafts are saved locally.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Type Selection */}
            <div>
              <Label htmlFor="type">Notification Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as NotificationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notice">Notice</SelectItem>
                  <SelectItem value="pickup">Pickup Update</SelectItem>
                  <SelectItem value="dropoff">Dropoff Assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Audience Selection */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="audience">Audience</Label>
                <Select value={audienceScope} onValueChange={(value) => setAudienceScope(value as AudienceScope)}>
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
                <div>
                  <Label htmlFor="shift">Select Shift</Label>
                  <Select value={shift || ''} onValueChange={(value) => setShift(value as ShiftType)}>
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

              {audienceScope === 'route' && (
                <div>
                  <Label>Select Route(s)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                    {routes.map((route) => (
                      <div key={route.routeId} className="flex items-center space-x-2">
                        <Checkbox
                          id={route.routeId}
                          checked={selectedRoutes.includes(route.routeId)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRoutes([...selectedRoutes, route.routeId]);
                            } else {
                              setSelectedRoutes(selectedRoutes.filter(r => r !== route.routeId));
                            }
                          }}
                        />
                        <label htmlFor={route.routeId} className="text-sm cursor-pointer">
                          {route.routeName}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dropoff Matrix (only for dropoff type) */}
            {type === 'dropoff' && (
              <div className="space-y-2">
                <Label>Bus-Route Assignments</Label>
                <DropoffMatrix
                  routes={routes}
                  buses={buses}
                  assignments={dropoffAssignments}
                  onChange={setDropoffAssignments}
                />

                <div className="flex items-center space-x-2 mt-4">
                  <Checkbox
                    id="sendMode"
                    checked={sendMode === 'per-route'}
                    onCheckedChange={(checked) => setSendMode(checked ? 'per-route' : 'aggregated')}
                  />
                  <label htmlFor="sendMode" className="text-sm cursor-pointer">
                    Send per-route messages (one notification per route)
                  </label>
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Notification title"
                maxLength={100}
              />
            </div>

            {/* Message Editor */}
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
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

            {/* FCM Option (only for trip type - hidden for now since trip is system-generated) */}
            {type === 'trip' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendFCM"
                  checked={sendFCM}
                  onCheckedChange={(checked) => setSendFCM(checked as boolean)}
                />
                <label htmlFor="sendFCM" className="text-sm cursor-pointer">
                  Also send push notification (FCM)
                </label>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button variant="outline" onClick={handlePreview} disabled={!isFormValid() || loading}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSend} disabled={!isFormValid() || loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? 'Sending...' : 'Send Notification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={(isOpen) => !isOpen && setShowPreview(false)}>
        <DialogContent
          onWheel={(e) => e.stopPropagation()}
          className="max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Preview Notification</DialogTitle>
            <DialogDescription>
              Review before sending
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Type</p>
              <p className="text-lg capitalize">{type}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500">Audience</p>
              <p className="text-lg">
                {audienceScope === 'all' && 'All Students'}
                {audienceScope === 'shift' && `${shift} Shift`}
                {audienceScope === 'route' && `Routes: ${selectedRoutes.map(r => routes.find(route => route.routeId === r)?.routeName || r).join(', ')}`}
              </p>
            </div>

            {recipientCount !== null && (
              <div>
                <p className="text-sm font-medium text-gray-500">Estimated Recipients</p>
                <p className="text-lg font-bold text-blue-600">{recipientCount} student(s)</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-500">Title</p>
              <p className="text-lg font-semibold">{title}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500">Message</p>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md whitespace-pre-wrap font-mono text-sm">
                {message}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Back to Edit
            </Button>
            <Button onClick={handleSend} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? 'Sending...' : 'Confirm & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}




