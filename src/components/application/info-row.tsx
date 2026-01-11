import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface InfoRowProps {
  label: string;
  value: string | number | React.ReactNode;
  icon?: LucideIcon;
  className?: string;
  valueClassName?: string;
  copyable?: boolean;
}

export function InfoRow({ label, value, icon: Icon, className, valueClassName, copyable }: InfoRowProps) {
  const handleCopy = async () => {
    if (typeof value === 'string' || typeof value === 'number') {
      await navigator.clipboard.writeText(String(value));
    }
  };

  return (
    <div className={cn("flex flex-col space-y-1.5", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className={cn("text-sm font-semibold text-foreground flex items-center gap-2", valueClassName)}>
        {value || "—"}
        {copyable && typeof value === 'string' && (
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Copy to clipboard"
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}
