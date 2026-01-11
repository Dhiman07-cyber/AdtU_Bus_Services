/**
 * Premium Button Component
 * Consistent, beautiful button styling across the app
 */

import React from 'react';
import { Button } from './ui/button';
import { LucideIcon } from 'lucide-react';
import { ButtonLoader } from './LoadingSpinner';

interface PremiumButtonProps {
  onClick?: () => void;
  label: string;
  icon?: LucideIcon;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  type?: 'button' | 'submit';
  className?: string;
}

export function PremiumButton({
  onClick,
  label,
  icon: Icon,
  loading = false,
  loadingText,
  disabled = false,
  variant = 'primary',
  type = 'button',
  className = ''
}: PremiumButtonProps) {
  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600',
    secondary: 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white dark:border-gray-600',
    success: 'bg-green-600 hover:bg-green-700 text-white border-green-600',
    danger: 'bg-red-600 hover:bg-red-700 text-white border-red-600'
  };

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${variantStyles[variant]}
        rounded-lg px-6 py-2 shadow-md hover:shadow-lg 
        transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99]
        font-medium border
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        ${className}
      `}
    >
      {loading ? (
        <ButtonLoader text={loadingText || `${label}...`} />
      ) : (
        <>
          {Icon && <Icon className="h-4 w-4 mr-2" />}
          {label}
        </>
      )}
    </Button>
  );
}

