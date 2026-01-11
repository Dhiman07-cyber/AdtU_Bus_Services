"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PremiumCard Component
 * =====================
 * A standardized card component following the premium design system.
 * 
 * Variants:
 * - info: Compact info cards with hover scale (1.02) + purple glow
 * - visual: Full-width visual cards with subtle raise on hover (no scale)
 * 
 * Accessibility:
 * - Keyboard focusable when clickable
 * - Focus ring visible on focus-visible
 * - ARIA role="button" when onClick provided
 */

type CardVariant = "info" | "visual";

interface PremiumCardProps {
    children: React.ReactNode;
    variant?: CardVariant;
    className?: string;
    onClick?: () => void;
    glowColor?: "purple" | "blue" | "orange" | "green" | "red";
    fullWidth?: boolean;
    "aria-label"?: string;
}

const glowColorMap = {
    purple: "hover:ring-purple-glow hover:shadow-glow-purple",
    blue: "hover:ring-[rgba(59,130,246,0.14)] hover:shadow-glow-blue",
    orange: "hover:ring-[rgba(251,146,60,0.14)] hover:shadow-glow-orange",
    green: "hover:ring-[rgba(16,185,129,0.14)] hover:shadow-glow-green",
    red: "hover:ring-[rgba(239,68,68,0.14)] hover:shadow-[0_0_20px_rgba(239,68,68,0.14)]",
};

export function PremiumCard({
    children,
    variant = "info",
    className = "",
    onClick,
    glowColor = "purple",
    fullWidth = false,
    "aria-label": ariaLabel,
}: PremiumCardProps) {
    // Base styles
    const baseClasses = cn(
        "rounded-card p-4 transition-all duration-160 ease-card-hover transform-gpu",
        "bg-theme-surface border border-[rgba(255,255,255,0.06)]",
        "shadow-card"
    );

    // Variant-specific hover effects
    const variantClasses = {
        info: cn(
            "hover:scale-[1.02] hover:shadow-card-hover hover:border-[rgba(255,255,255,0.12)]",
            "hover:ring-1",
            glowColorMap[glowColor]
        ),
        visual: cn(
            "hover:shadow-card-hover hover:border-[rgba(255,255,255,0.12)]"
        ),
    };

    // Full width for visual cards in grid
    const widthClasses = fullWidth ? "col-span-full" : "";

    // Interactive classes when clickable
    const interactiveClasses = onClick
        ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent focus-visible:ring-offset-2 focus-visible:ring-offset-theme-bg"
        : "";

    const combinedClasses = cn(
        baseClasses,
        variantClasses[variant],
        widthClasses,
        interactiveClasses,
        className
    );

    return (
        <div
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={(e) => {
                if (onClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onClick();
                }
            }}
            aria-label={ariaLabel}
            className={combinedClasses}
        >
            {children}
        </div>
    );
}

/**
 * PremiumCardHeader Component
 */
interface PremiumCardHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export function PremiumCardHeader({ children, className = "" }: PremiumCardHeaderProps) {
    return (
        <div className={cn("flex items-center justify-between mb-3", className)}>
            {children}
        </div>
    );
}

/**
 * PremiumCardTitle Component
 */
interface PremiumCardTitleProps {
    children: React.ReactNode;
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function PremiumCardTitle({ children, className = "", size = "md" }: PremiumCardTitleProps) {
    const sizeClasses = {
        sm: "text-xs font-medium text-theme-text-secondary",
        md: "text-sm font-semibold text-theme-text",
        lg: "text-base font-bold text-theme-text",
    };

    return (
        <h3 className={cn(sizeClasses[size], className)}>
            {children}
        </h3>
    );
}

/**
 * PremiumCardContent Component
 */
interface PremiumCardContentProps {
    children: React.ReactNode;
    className?: string;
}

export function PremiumCardContent({ children, className = "" }: PremiumCardContentProps) {
    return (
        <div className={cn("", className)}>
            {children}
        </div>
    );
}

/**
 * PremiumCardValue Component
 * For displaying large KPI numbers
 */
interface PremiumCardValueProps {
    children: React.ReactNode;
    className?: string;
    color?: "default" | "accent" | "success" | "danger" | "warning";
}

const valueColorMap = {
    default: "text-theme-text",
    accent: "text-theme-accent",
    success: "text-theme-success",
    danger: "text-theme-danger",
    warning: "text-theme-warning",
};

export function PremiumCardValue({ children, className = "", color = "default" }: PremiumCardValueProps) {
    return (
        <div className={cn("text-2xl font-bold", valueColorMap[color], className)}>
            {children}
        </div>
    );
}

/**
 * PremiumCardLabel Component
 * For small descriptive labels
 */
interface PremiumCardLabelProps {
    children: React.ReactNode;
    className?: string;
}

export function PremiumCardLabel({ children, className = "" }: PremiumCardLabelProps) {
    return (
        <p className={cn("text-xs text-theme-text-muted mt-1", className)}>
            {children}
        </p>
    );
}

/**
 * PremiumCardIcon Component
 * For displaying icons in card headers
 */
interface PremiumCardIconProps {
    children: React.ReactNode;
    className?: string;
    color?: "blue" | "green" | "orange" | "purple" | "red" | "cyan";
}

const iconColorMap = {
    blue: "text-theme-accent",
    green: "text-theme-success",
    orange: "text-theme-accent-2",
    purple: "text-theme-accent-3",
    red: "text-theme-danger",
    cyan: "text-theme-info",
};

export function PremiumCardIcon({ children, className = "", color = "blue" }: PremiumCardIconProps) {
    return (
        <div className={cn("transition-transform group-hover:scale-110", iconColorMap[color], className)}>
            {children}
        </div>
    );
}

// Export all components
export default PremiumCard;
