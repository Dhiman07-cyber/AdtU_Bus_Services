
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
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

interface FeedbackCardProps {
    entry: FeedbackEntry;
    onView: (entry: FeedbackEntry) => void;
    // onDelete and onMarkAsRead are removed from card actions as per request
    onDelete?: (entry: FeedbackEntry) => void;
    onMarkAsRead?: (entry: FeedbackEntry) => void;
    currentUserId?: string;
}

const FeedbackCard: React.FC<FeedbackCardProps> = ({
    entry,
    onView
}) => {
    // Format date: "16 Dec 2025"
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Capitalize role
    const formatRole = (role: string) => {
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    return (
        <div
            className={cn(
                "group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 bg-card border-border shadow-sm hover:shadow-md",
                // Slightly deeper highlight for unread if needed, but "Read/unread state removed" from visuals mostly
                // We'll keep a subtle border diff if it's unread maybe? The prompt says "Read/unread state removed"
                // But let's keep it clean as requested.
            )}
        >
            {/* Avatar: Real image or Fallback */}
            <div className="flex-shrink-0">
                <Avatar
                    src={entry.profile_url}
                    name={entry.name}
                    size="md"
                    className="h-12 w-12"
                />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 grid gap-1.5">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-base text-foreground truncate">
                        {entry.name}
                    </span>
                    <Badge
                        variant="secondary"
                        className={cn(
                            "text-[10px] px-2 py-0.5 font-medium border-0",
                            entry.role === 'driver'
                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        )}
                    >
                        {formatRole(entry.role)}
                    </Badge>
                </div>

                {/* Message Pill */}
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-foreground/80 line-clamp-2 md:line-clamp-2">
                    {entry.message}
                </div>
            </div>

            {/* Right Side: Date & View Action */}
            <div className="flex flex-col items-end gap-2 ml-2">
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                    {formatDate(entry.created_at)}
                </span>

                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs font-medium px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => onView(entry)}
                >
                    <Eye size={14} />
                    View
                </Button>
            </div>
        </div>
    );
};

export default FeedbackCard;
