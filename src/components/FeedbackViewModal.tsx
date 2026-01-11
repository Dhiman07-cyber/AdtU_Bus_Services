import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    X,
    Copy,
    Trash2,
    CheckCircle,
    Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/contexts/toast-context';
import Avatar from '@/components/Avatar';

interface FeedbackEntry {
    id: string;
    user_id: string;
    uid: string;
    name: string;
    email: string;
    role: 'student' | 'driver';
    message: string;
    created_at: string;
    read: boolean;
    read_at?: string;
    read_by?: string;
    auto_delete_at: string;
    profile_url?: string;
}

interface FeedbackViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    feedback: FeedbackEntry | null;
    onDelete: (entry: FeedbackEntry) => void;
    onMarkAsRead: (entry: FeedbackEntry) => void;
    currentUserId?: string;
    userRole?: 'admin' | 'moderator';
}

const FeedbackViewModal: React.FC<FeedbackViewModalProps> = ({
    isOpen,
    onClose,
    feedback,
    onDelete,
    onMarkAsRead,
    userRole
}) => {
    const { addToast } = useToast();

    if (!feedback) return null;

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        addToast(`${label} copied to clipboard`, 'success');
    };

    const formatRole = (role: string) => {
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    const isRead = feedback.read;
    const isAdmin = userRole === 'admin';

    // Moderator cannot delete
    // Admin can delete

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                onWheel={(e) => e.stopPropagation()}
                showCloseButton={false}
                className="sm:max-w-md md:max-w-lg bg-[#0f111a] border-gray-800 shadow-2xl p-0 overflow-hidden gap-0 rounded-2xl"
            >

                {/* Header Section */}
                <div className="p-6 pb-4 relative">
                    {/* Single Close Button with Hover Red BG */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="absolute right-4 top-4 rounded-full text-gray-400 hover:text-white hover:bg-red-500/20"
                    >
                        <X size={20} />
                    </Button>

                    <div className="flex items-center gap-4">
                        <Avatar
                            src={feedback.profile_url}
                            name={feedback.name}
                            size="lg"
                            className="h-16 w-16"
                        />

                        <div className="space-y-1">
                            <DialogTitle className="text-xl font-bold tracking-tight text-white">
                                {feedback.name}
                            </DialogTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-0 uppercase text-[10px] tracking-wide">
                                    {feedback.role}
                                </Badge>
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    {new Date(feedback.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <ScrollArea
                    className="max-h-[60vh] px-6 py-2 overscroll-contain touch-pan-y"
                    onWheel={(e) => e.stopPropagation()}
                >
                    <div className="grid gap-4 pb-6">

                        {/* Identity Info Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#1a1d2d] p-3 rounded-xl border border-gray-800/60">
                                <div className="text-[10px] uppercase font-bold text-gray-500 mb-1">UID</div>
                                <div className="text-sm font-mono text-gray-200 truncate" title={feedback.uid}>{feedback.uid}</div>
                            </div>

                            <div className="bg-[#1a1d2d] p-3 rounded-xl border border-gray-800/60">
                                <div className="text-[10px] uppercase font-bold text-gray-500 mb-1">EMAIL</div>
                                <div className="text-sm text-gray-200 truncate" title={feedback.email}>{feedback.email}</div>
                            </div>
                        </div>

                        {/* Message Box */}
                        <div className="bg-[#1a1d2d] rounded-xl border border-gray-800/60 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-[#1f2235]">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-3 bg-blue-500 rounded-full"></div>
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Message</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] gap-1 text-gray-400 hover:text-white"
                                    onClick={() => copyToClipboard(feedback.message, 'Message')}
                                >
                                    <Copy size={10} />
                                    Copy Text
                                </Button>
                            </div>
                            <div className="p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {feedback.message}
                            </div>
                        </div>

                        {/* Read By Info (Admin Only) */}
                        {isAdmin && isRead && feedback.read_by && (
                            <div className="text-xs text-gray-500 bg-[#1a1d2d] p-2 rounded-lg border border-gray-800/60 flex items-center gap-2">
                                <CheckCircle size={12} className="text-green-500" />
                                <span>Read by: <span className="text-gray-300 font-medium">{feedback.read_by}</span></span>
                            </div>
                        )}

                        {/* Status & Actions Bar */}
                        <div className="flex items-center justify-between bg-[#1a1d2d] p-2 rounded-xl border border-gray-800/60">
                            <div className="flex items-center gap-3 px-2">
                                <span className="text-xs text-gray-500 font-medium">Status:</span>
                                {isRead ? (
                                    <Badge className="bg-green-500/10 text-green-500 border-0 hover:bg-green-500/20 text-[10px] uppercase">READ</Badge>
                                ) : (
                                    <Badge className="bg-red-500/10 text-red-500 border-0 hover:bg-red-500/20 text-[10px] uppercase">UNREAD</Badge>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                {/* Mark as Read: Admin Only (and only if unread) */}
                                {isAdmin && !isRead && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                        onClick={() => onMarkAsRead(feedback)}
                                    >
                                        <CheckCircle size={14} className="mr-1.5" />
                                        Mark as Read
                                    </Button>
                                )}

                                {/* Delete: Admin Only */}
                                {isAdmin && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                        onClick={() => onDelete(feedback)}
                                    >
                                        <Trash2 size={14} className="mr-1.5" />
                                        Delete
                                    </Button>
                                )}

                                {/* Removed separate Close button, using X at top */}
                            </div>
                        </div>

                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

export default FeedbackViewModal;
