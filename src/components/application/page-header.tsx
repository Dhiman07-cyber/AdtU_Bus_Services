import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: {
    label: string;
    count: number;
  };
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, badge, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {badge && (
              <Badge className="text-[10px] font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-tight rounded-md">
                {badge.count} {badge.label}
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-muted-foreground text-sm max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
