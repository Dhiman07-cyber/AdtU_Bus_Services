"use client";

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  User,
  Clock,
  EyeOff,
  Bell,
  Calendar,
  CheckCheck,
  MapPin,
  Globe,
  Loader2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import NotificationFormV2 from './NotificationFormV2';
import { UserNotificationView } from '@/lib/notifications/types';
import { formatDistanceToNow, format } from 'date-fns';

interface NotificationCardV2Props {
  notification: UserNotificationView;
  onMarkAsRead?: (id: string) => Promise<void>;
  onEdit?: (id: string, updates: { title?: string, content: string, metadata?: any }) => Promise<void>;
  onDeleteGlobally?: (id: string) => Promise<void>;
  onRefresh?: () => void;
}

export default function NotificationCardV2({
  notification,
  onMarkAsRead,
  onEdit,
  onDeleteGlobally,
  onRefresh,
}: NotificationCardV2Props) {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      let date: Date;
      if (timestamp.toDate) date = timestamp.toDate();
      else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
      else date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) { return ''; }
  };

  const formatExpiry = (timestamp: any) => {
    if (!timestamp) return null;
    try {
      let date: Date;
      if (timestamp.toDate) date = timestamp.toDate();
      else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
      else date = new Date(timestamp);
      return format(date, 'MMM d, h:mm a');
    } catch (error) { return null; }
  };

  const formatFullDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      let date: Date;
      if (timestamp.toDate) date = timestamp.toDate();
      else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
      else date = new Date(timestamp);
      return format(date, 'MMMM d, yyyy • h:mm a');
    } catch (error) { return ''; }
  };

  // Determine the target role for visual accents
  const getTargetRole = () => {
    const { target } = notification;
    if (target.type === 'all_users') return 'all';
    if (target.roleFilter) return target.roleFilter;
    if (target.type === 'route_based' || target.type === 'bus_based') return 'student';
    return 'all';
  };

  const targetRole = getTargetRole();

  const roleThemes = {
    student: {
      color: "indigo",
      label: "Students",
      bg: "bg-indigo-500",
      lightBg: "bg-indigo-50/50",
      border: "border-indigo-100",
      accent: "from-indigo-500 to-blue-600",
      glow: "shadow-indigo-500/20"
    },
    driver: {
      color: "emerald",
      label: "Drivers",
      bg: "bg-emerald-500",
      lightBg: "bg-emerald-50/50",
      border: "border-emerald-100",
      accent: "from-emerald-500 to-teal-600",
      glow: "shadow-emerald-500/20"
    },
    moderator: {
      color: "purple",
      label: "Moderators",
      bg: "bg-purple-500",
      lightBg: "bg-purple-50/50",
      border: "border-purple-100",
      accent: "from-purple-500 to-pink-600",
      glow: "shadow-purple-500/20"
    },
    admin: {
      color: "rose",
      label: "Admins",
      bg: "bg-rose-500",
      lightBg: "bg-rose-50/50",
      border: "border-rose-100",
      accent: "from-rose-500 to-red-600",
      glow: "shadow-rose-500/20"
    },
    all: {
      color: "blue",
      label: "Everyone",
      bg: "bg-blue-600",
      lightBg: "bg-blue-50/50",
      border: "border-blue-100",
      accent: "from-blue-600 to-indigo-700",
      glow: "shadow-blue-500/20"
    }
  };

  const typeThemes = {
    trip: { icon: Globe },
    notice: { icon: Bell },
    pickup: { icon: MapPin },
    dropoff: { icon: MapPin },
    announcement: { icon: AlertCircle },
    default: { icon: Bell }
  };

  const roleTheme = roleThemes[targetRole] || roleThemes.all;
  const typeTheme = typeThemes[notification.type] || typeThemes.default;
  const ThemeIcon = typeTheme.icon;

  const handleMarkAsRead = async () => {
    if (onMarkAsRead && !notification.isRead) {
      setLoading(true);
      try {
        await onMarkAsRead(notification.id);
        onRefresh?.();
      } catch (error) { addToast('Failed to mark as read', 'error'); }
      finally { setLoading(false); }
    }
  };

  const handleEdit = async (id: string, updates: { title?: string, content: string, metadata?: any }) => {
    setLoading(true);
    try {
      if (onEdit) {
        await onEdit(id, updates);
        // setIsEditDialogOpen(false); // Can be handled by form or here
        addToast('Updated successfully', 'success');
        onRefresh?.();
      }
    } catch (error) { addToast('Failed to update', 'error'); }
    finally { setLoading(false); }
  };

  const expiryDisplay = formatExpiry(notification.expiryAt);

  return (
    <>
      <Card
        className={`group relative flex flex-col overflow-hidden transition-all duration-500 border-l-[6px] cursor-pointer ${!notification.isRead
          ? `bg-gradient-to-br from-white to-${roleTheme.color}-50/40 dark:from-slate-800/60 dark:to-${roleTheme.color}-900/20 ${roleTheme.glow} scale-[1.01] z-10 border-r border-t border-b border-${roleTheme.color}-200/50 dark:border-${roleTheme.color}-800/30`
          : `bg-white dark:bg-slate-900/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:dark:bg-slate-900 transition-all shadow-black/5`} rounded-[24px] border ${roleTheme.border} dark:border-slate-800 hover:shadow-2xl hover:shadow-${roleTheme.color}-500/10 transition-all duration-300`}
        style={{ borderLeftColor: `var(--role-${targetRole})` }}
        onClick={() => {
          setIsViewDialogOpen(true);
          if (!notification.isRead) handleMarkAsRead();
        }}
      >
        {/* Unread Animation */}
        {!notification.isRead && (
          <div className={`absolute top-0 right-0 w-24 h-24 bg-${roleTheme.color}-500/10 blur-3xl -mr-12 -mt-12 animate-pulse`} />
        )}

        <CardContent className="p-0">
          <div className="p-5 space-y-4 pt-0">
            {/* Header: Type & Metadata */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${roleTheme.accent} text-white shadow-lg overflow-hidden relative group-hover:scale-110 transition-transform duration-500`}>
                  <ThemeIcon className="h-4 w-4 relative z-10" />
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.15em] bg-clip-text text-transparent bg-gradient-to-r ${roleTheme.accent}`}>
                      {notification.type}
                    </span>
                    <Badge variant="outline" className={`h-4 text-[8px] font-bold border-${roleTheme.color}-200 text-${roleTheme.color}-600 dark:border-${roleTheme.color}-800 dark:text-${roleTheme.color}-400 px-1.5`}>
                      {roleTheme.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                    <Clock className="h-3 w-3" />
                    {formatDate(notification.createdAt)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!notification.isRead && (
                  <span className={`flex h-2 w-2 rounded-full bg-${roleTheme.color}-500 animate-bounce`} />
                )}
                {(notification.canEdit || notification.canDeleteGlobally) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all hover:scale-110 hover:rotate-90">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 rounded-[20px] border-slate-200/50 dark:border-slate-800/50 shadow-2xl backdrop-blur-xl bg-white/90 dark:bg-slate-950/90 p-1.5">
                      <DropdownMenuItem className="py-2.5 rounded-xl font-bold text-xs cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-900 transition-all" onClick={() => {
                        setIsViewDialogOpen(true);
                        if (!notification.isRead) handleMarkAsRead();
                      }}>
                        <Eye className="h-4 w-4 mr-3 text-slate-500" /> View Detailed Broadcast
                      </DropdownMenuItem>
                      {!notification.isRead && (
                        <DropdownMenuItem className="py-2.5 rounded-xl font-bold text-xs cursor-pointer focus:bg-blue-50 dark:focus:bg-blue-900/40 text-blue-600 transition-all" onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead();
                        }}>
                          <CheckCheck className="h-4 w-4 mr-3" /> Acknowledge Message
                        </DropdownMenuItem>
                      )}
                      {notification.canEdit && (
                        <DropdownMenuItem className="py-2.5 rounded-xl font-bold text-xs cursor-pointer focus:bg-amber-50 dark:focus:bg-amber-900/40 text-amber-600 transition-all" onClick={(e) => {
                          e.stopPropagation();
                          setIsEditDialogOpen(true);
                        }}>
                          <Edit className="h-4 w-4 mr-3" /> Edit Announcement
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator className="my-1.5" />
                      {notification.canDeleteGlobally && (
                        <DropdownMenuItem
                          className="py-2.5 rounded-xl font-bold text-xs cursor-pointer text-red-600 focus:bg-red-600 focus:text-white transition-all transform active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-3" /> Delete Globally
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Title: The Core Focus */}
            <div className="space-y-2">
              <h3 className={`text-[17px] font-extrabold leading-tight tracking-tight ${!notification.isRead ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                {notification.title}
              </h3>
              <p className={`text-[13px] leading-relaxed font-medium line-clamp-2 ${notification.isRead ? 'text-slate-500/80' : 'text-slate-600 dark:text-slate-400'}`}>
                {notification.content}
              </p>
            </div>

            {/* Footer Information */}
            <div className="pt-4 flex items-center justify-between border-t border-slate-100/60 dark:border-slate-800/40">
              <div className="flex items-center gap-2.5 group/sender">
                <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${roleTheme.accent} p-[1.5px] transition-transform group-hover/sender:scale-110`}>
                  <div className="h-full w-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                    <User className={`h-3.5 w-3.5 text-${roleTheme.color}-500 animate-pulse`} />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-none tracking-tight">{notification.sender.userName}</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="secondary" className="h-3.5 text-[7px] font-black uppercase tracking-widest px-1 bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {notification.sender.userRole}
                    </Badge>
                  </div>
                </div>
              </div>

              {expiryDisplay && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50/60 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-100/40 dark:border-orange-900/20 transition-all hover:scale-105">
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px] font-black uppercase tracking-wider">{expiryDisplay}</span>
                </div>
              )}
            </div>
          </div>

          {/* Detailed View Link for Unread */}
          {!notification.isRead && (
            <button
              onClick={() => {
                setIsViewDialogOpen(true);
                if (!notification.isRead) handleMarkAsRead();
              }}
              className={`w-full py-3.5 bg-gradient-to-r ${roleTheme.accent} hover:brightness-110 active:scale-[0.98] text-[11px] font-black text-white uppercase tracking-[0.2em] transition-all shadow-lg overflow-hidden relative group/btn`}
            >
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
              Open Full Broadcast
            </button>
          )}
        </CardContent>

        <style jsx>{`
            :root {
                --role-student: #6366f1;
                --role-driver: #10b981;
                --role-moderator: #a855f7;
                --role-admin: #f43f5e;
                --role-all: #2563eb;
            }
        `}</style>
      </Card>

      {/* Enhanced View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent
          onWheel={(e) => e.stopPropagation()}
          className="max-w-[98vw] sm:max-w-4xl p-0 border-0 rounded-2xl sm:rounded-[28px] overflow-hidden bg-white dark:bg-slate-950 shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-500 sm:top-[54%] !translate-y-[-50%] sm:mt-0"
        >
          <div className="relative flex flex-col max-h-[80vh] sm:max-h-[90vh]">
            {/* Modal Header Wrap - Compact on mobile */}
            <div className={`relative px-3 sm:px-8 pt-6 sm:pt-10 pb-3 sm:pb-6 bg-gradient-to-br from-${roleTheme.color}-500/5 to-transparent`}>
              <div className={`absolute top-0 left-0 w-full h-0.5 sm:h-1.5 bg-gradient-to-r ${roleTheme.accent}`} />

              {/* Mobile: Stacked Layout, Desktop: Row Layout */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-3 sm:mb-6">
                {/* Left: Icon + Badges */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-[16px] bg-gradient-to-br ${roleTheme.accent} shadow-lg ${roleTheme.glow} flex items-center justify-center text-white ring-1 sm:ring-4 ring-${roleTheme.color}-500/5`}>
                    <ThemeIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`bg-${roleTheme.color}-500 hover:bg-${roleTheme.color}-600 text-white font-black px-1 sm:px-1.5 py-0 sm:py-0.5 text-[6px] sm:text-[8px] tracking-wider border-0 shadow-sm`}>
                        {notification.type.toUpperCase()}
                      </Badge>
                      {!notification.isRead && (
                        <Badge variant="default" className="bg-blue-600 text-[6px] sm:text-[8px] font-black px-1 py-0 uppercase animate-pulse shadow-sm">New</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[8px] sm:text-[10px] text-slate-400 font-bold">
                      <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="truncate max-w-[140px] sm:max-w-none">{formatFullDate(notification.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Sender Info - Compact on mobile */}
                <div className="flex items-center gap-2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200/40 dark:border-slate-800/40 shadow-sm self-start sm:self-auto">
                  <div className={`h-6 w-6 sm:h-8 sm:w-8 rounded-md sm:rounded-lg bg-gradient-to-br ${roleTheme.accent} flex items-center justify-center font-black text-white shadow-md text-[10px] sm:text-xs ring-1 sm:ring-2 ring-white dark:ring-slate-900`}>
                    {notification.sender.userName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[8px] sm:text-[10px] font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">{notification.sender.userName}</p>
                    <p className={`text-[6px] sm:text-[7px] text-${roleTheme.color}-600 dark:text-${roleTheme.color}-400 font-black uppercase tracking-widest`}>{notification.sender.userRole}</p>
                  </div>
                </div>
              </div>

              <DialogTitle className="text-base sm:text-2xl font-[900] text-slate-900 dark:text-white leading-tight tracking-tight pr-6 sm:pr-6">
                {notification.title}
              </DialogTitle>
            </div>

            {/* Scrollable Content Area - Compact on mobile */}
            <div
              className="px-3 sm:px-8 py-3 sm:py-6 overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y flex-1 relative max-h-[350px] sm:max-h-[450px]"
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="max-w-none relative z-10">
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium tracking-tight whitespace-pre-wrap mb-4">
                  {(() => {
                    const matrixData = (notification as any).metadata?.matrix;
                    if (matrixData && matrixData.length > 0) {
                      // If we have matrix data, we attempt to clean the ASCII version from the text
                      // The ASCII version usually starts with "Bus-X :"
                      const lines = notification.content.split('\n');
                      const introLines = lines.filter(line => !line.trim().startsWith('Bus-') && !line.includes(' : Route-'));
                      return introLines.join('\n').trim();
                    }
                    return notification.content;
                  })()}
                </div>

                {/* Premium Matrix Table */}
                {(() => {
                  const matrixData = (notification as any).metadata?.matrix;
                  if (!matrixData || matrixData.length === 0) return null;

                  return (
                    <div className="mt-4 sm:mt-8 mb-4 sm:mb-6 overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-lg sm:shadow-xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
                      <div className={`px-2.5 sm:px-4 py-2 sm:py-3 bg-gradient-to-r ${roleTheme.accent} text-white flex items-center justify-between`}>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em]">Dropoff Matrix</span>
                        </div>
                        <Badge variant="outline" className="text-[6px] sm:text-[8px] font-black border-white/20 text-white bg-white/10 uppercase tracking-wide sm:tracking-widest">{matrixData.length} Buses</Badge>
                      </div>

                      {/* Mobile: Compact Card Layout, Desktop: Table */}
                      <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200/40 dark:border-slate-800/40">
                              <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Service Vehicle</th>
                              <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Assigned Route</th>
                              <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Coverage & Stops</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
                            {matrixData.map((row: any, idx: number) => (
                              <tr key={idx} className="group/row hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="px-4 py-4 min-w-[180px]">
                                  <div className={`inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gradient-to-br ${roleTheme.accent} text-[11px] font-black text-white shadow-lg transition-all group-hover/row:scale-[1.02] whitespace-nowrap`}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                                    <span>{row.busNumber}</span>
                                    {row.plateNumber && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-[9px] font-bold text-white/90">({row.plateNumber})</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">{row.routeName}</span>
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Verified Schedule</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex flex-wrap gap-1.5">
                                    {row.stops?.map((stop: any, sIdx: number) => (
                                      <span key={sIdx} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 group-hover/row:border-blue-500/30 group-hover/row:text-blue-600 transition-all shadow-sm">
                                        {stop.name}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile: Compact Card View - No Horizontal Scroll */}
                      <div className="block sm:hidden divide-y divide-slate-100/50 dark:divide-slate-800/50">
                        {matrixData.map((row: any, idx: number) => (
                          <div key={idx} className="p-2.5 space-y-1.5">
                            {/* Bus + Route on same line */}
                            <div className="flex items-center justify-between gap-2">
                              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-br ${roleTheme.accent} text-[8px] font-black text-white shadow-md`}>
                                <div className="w-1 h-1 rounded-full bg-white/40 animate-pulse" />
                                <span>{row.busNumber}</span>
                                {row.plateNumber && (
                                  <span className="text-[7px] text-white/80">({row.plateNumber})</span>
                                )}
                              </div>
                              <span className="text-[10px] font-extrabold text-slate-900 dark:text-slate-100">{row.routeName}</span>
                            </div>
                            {/* Stops as wrap - show all */}
                            <div className="flex flex-wrap gap-1">
                              {row.stops?.map((stop: any, sIdx: number) => (
                                <span key={sIdx} className="inline-flex items-center px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[7px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200/40 dark:border-slate-700/40">
                                  {stop.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {notification.title.toLowerCase().includes('swap') && (
                <div className="mt-6">
                  <Link href="/driver/driver-swap-requests?tab=incoming" className={`group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r ${roleTheme.accent} text-white hover:scale-[1.01] active:scale-95 transition-all shadow-lg ${roleTheme.glow}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center backdrop-blur-md">
                        <AlertCircle className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <span className="block font-black text-sm leading-tight text-white tracking-tight">Action Required</span>
                        <span className="text-white/70 text-[10px] font-bold tracking-wide">Respond to this swap request</span>
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center transition-transform group-hover:translate-x-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                </div>
              )}

              <div className={`absolute bottom-0 right-0 w-40 h-40 bg-${roleTheme.color}-500/5 blur-[80px] pointer-events-none -z-10`} />
            </div>

            {/* Modal Footer */}
            <div className="px-6 sm:px-8 py-5 border-t border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                {expiryDisplay && (
                  <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-orange-50/80 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-100/50 dark:border-orange-900/30 w-full sm:w-auto shadow-sm">
                    <Clock className="h-3.5 w-3.5" />
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black uppercase tracking-[0.1em] leading-none mb-0.5 opacity-70">Expires On</span>
                      <span className="text-px[10px] font-black">{expiryDisplay}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800/50 text-slate-500 border border-slate-200/50 dark:border-slate-700/50 w-full sm:w-auto shadow-sm">
                  <div className={`h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]`} />
                  <span className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-400">Official Broadcast</span>
                </div>
              </div>

              <Button
                onClick={() => setIsViewDialogOpen(false)}
                className={`w-full sm:w-auto h-11 px-8 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg`}
              >
                Close View
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Form */}
      <NotificationFormV2
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        mode="edit"
        initialData={notification}
        onEdit={handleEdit}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[40px] border-0 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.4)] p-12 bg-white dark:bg-slate-950 max-w-lg">
          <AlertDialogHeader>
            <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-[28px] flex items-center justify-center mb-8 mx-auto animate-bounce">
              <Trash2 className="h-10 w-10 text-red-600" />
            </div>
            <AlertDialogTitle className="text-3xl font-black text-center text-slate-900 dark:text-white tracking-tight">Destructive Action</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 dark:text-slate-400 text-lg font-medium text-center leading-relaxed mt-4">
              This will permanently revoke access to this notification for <span className="text-red-600 font-bold">everyone</span>. This action is final and irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-12 flex flex-col sm:flex-row gap-4 w-full">
            <AlertDialogCancel className="w-full sm:w-1/2 font-black text-xs uppercase tracking-widest rounded-2xl border-slate-200 h-14 hover:bg-slate-50 transition-all">Abort Action</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeleteGlobally?.(notification.id)}
              className="w-full sm:w-1/2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl h-14 shadow-2xl shadow-red-500/30 active:scale-95 transition-all"
            >
              Confirm Deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
