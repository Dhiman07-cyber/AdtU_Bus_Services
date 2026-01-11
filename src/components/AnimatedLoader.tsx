"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnimatedLoaderProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function AnimatedLoader({ className, size = 'md' }: AnimatedLoaderProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  return (
    <>
      <style jsx global>{`
        @keyframes colorChange {
          0%, 100% {
            color: #3b82f6; /* blue-500 */
          }
          16.67% {
            color: #6366f1; /* indigo-500 */
          }
          33.33% {
            color: #8b5cf6; /* purple-500 */
          }
          50% {
            color: #d946ef; /* fuchsia-500 */
          }
          66.67% {
            color: #ec4899; /* pink-500 */
          }
          83.33% {
            color: #06b6d4; /* cyan-500 */
          }
        }

        .loader-color-change {
          animation: colorChange 4s ease-in-out infinite;
        }
      `}</style>
      
      <Loader2 
        className={cn(
          'animate-spin loader-color-change',
          sizeClasses[size],
          className
        )} 
      />
    </>
  );
}

export default AnimatedLoader;
