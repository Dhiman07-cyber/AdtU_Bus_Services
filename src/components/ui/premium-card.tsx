import React from 'react';
import { cn } from '@/lib/utils';

interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  gradient?: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
  hover?: boolean;
  animate?: 'fade-in' | 'slide-up' | 'slide-down' | 'scale-in';
  delay?: number;
}

const gradients = {
  blue: 'from-blue-400 to-cyan-500',
  purple: 'from-purple-400 to-pink-500',
  green: 'from-green-400 to-emerald-500',
  orange: 'from-orange-400 to-red-500',
  pink: 'from-pink-400 to-rose-500',
  cyan: 'from-cyan-400 to-teal-500',
};

const animations = {
  'fade-in': 'animate-fade-in',
  'slide-up': 'animate-slide-in-up',
  'slide-down': 'animate-slide-in-down',
  'scale-in': 'animate-scale-in',
};

export function PremiumCard({
  className,
  gradient = 'blue',
  hover = true,
  animate,
  delay = 0,
  children,
  ...props
}: PremiumCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border-0 shadow-lg transition-all duration-300',
        hover && 'hover-lift hover:shadow-2xl',
        animate && animations[animate],
        'bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800',
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    >
      <div
        className={cn(
          'absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 opacity-10',
          `bg-gradient-to-br ${gradients[gradient]}`
        )}
      />
      {children}
    </div>
  );
}

interface PremiumButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gradient' | 'glow' | 'glass';
  gradient?: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
  size?: 'sm' | 'md' | 'lg';
}

export function PremiumButton({
  className,
  variant = 'gradient',
  gradient = 'blue',
  size = 'md',
  children,
  ...props
}: PremiumButtonProps) {
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const variantClasses = {
    gradient: cn(
      'relative overflow-hidden text-white font-medium shadow-lg hover:shadow-xl',
      'transform hover:-translate-y-0.5 transition-all duration-200',
      `bg-gradient-to-r ${gradients[gradient]}`,
      'hover:from-opacity-90 hover:to-opacity-90'
    ),
    glow: cn(
      'relative text-white font-medium',
      `bg-gradient-to-r ${gradients[gradient]}`,
      'shadow-[0_0_20px_rgba(59,130,246,0.5)]',
      'hover:shadow-[0_0_30px_rgba(59,130,246,0.8)]',
      'transition-all duration-300'
    ),
    glass: cn(
      'backdrop-blur-md bg-white/10 dark:bg-black/10',
      'border border-white/20 dark:border-white/10',
      'text-white font-medium',
      'hover:bg-white/20 dark:hover:bg-black/20',
      'transition-all duration-200'
    ),
  };

  return (
    <button
      className={cn(
        'group relative rounded-xl',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {variant === 'gradient' && (
        <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl" />
      )}
      <span className="relative flex items-center justify-center">
        {children}
      </span>
    </button>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  gradient?: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  gradient = 'blue',
  trend,
  trendValue,
}: StatCardProps) {
  return (
    <PremiumCard gradient={gradient} animate="slide-up">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              {title}
            </p>
            <p className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {subtitle}
              </p>
            )}
            {trend && trendValue && (
              <div className="flex items-center gap-1 mt-2">
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend === 'up' && 'text-green-600 dark:text-green-400',
                    trend === 'down' && 'text-red-600 dark:text-red-400',
                    trend === 'neutral' && 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  {trend === 'up' && '↑'}
                  {trend === 'down' && '↓'}
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div
            className={cn(
              'p-3 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-300',
              `bg-gradient-to-br ${gradients[gradient]}`
            )}
          >
            {icon}
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}
