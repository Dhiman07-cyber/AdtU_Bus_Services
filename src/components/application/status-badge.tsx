import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ApplicationStatus = "pending" | "approved" | "rejected" | "submitted";

interface StatusBadgeProps {
  status: ApplicationStatus;
  className?: string;
}

const statusConfig = {
  pending: {
    label: "Pending Review",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800"
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
  },
  submitted: {
    label: "Submitted",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
  }
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
