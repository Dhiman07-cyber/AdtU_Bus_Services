/**
 * Universal Loading Components
 * Consistent loading experience across the app
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Full Screen Loading Overlay
 * Use for main page loads and heavy operations
 */
export function FullScreenLoader({ message = "Please wait..." }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-nextjs-scroll-focus-boundary
    >
      <div className="flex flex-col items-center gap-3 bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="relative">
          <div className="w-10 h-10 sm:w-12 sm:h-12 border-3 sm:border-4 border-gray-200 dark:border-gray-700 rounded-full animate-spin border-t-blue-600"></div>
        </div>
        <p className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">{message}</p>
      </div>
    </div>
  );
}

/**
 * Inline Button Loading
 * Use inside buttons during operations
 */
export function ButtonLoader({ text = "Processing..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 border-2 border-white/30 rounded-full animate-spin border-t-white"></div>
      <span>{text}</span>
    </div>
  );
}

/**
 * Table Loading Skeleton
 * Use while fetching table data
 */
export function TableLoader({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-12 bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Card Loading Skeleton
 * Use for dashboard cards
 */
export function CardLoader() {
  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4" />
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
    </div>
  );
}

/**
 * Minimal Spinner
 * Use for small inline loading states
 */
export function MiniLoader({ className = "" }: { className?: string }) {
  return <div className={`w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded-full animate-spin border-t-blue-600 ${className}`}></div>;
}

/**
 * Page Content Loader
 * Use for content areas
 */
export function PageLoader({ message = "Please wait..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 sm:gap-4">
      <div className="relative">
        <div className="w-10 h-10 sm:w-12 sm:h-12 border-3 sm:border-4 border-gray-200 dark:border-gray-700 rounded-full animate-spin border-t-blue-600"></div>
      </div>
      <p className="text-base sm:text-lg font-medium text-gray-700 dark:text-gray-300">{message}</p>
    </div>
  );
}

/**
 * Premium Page Content Loader
 * A fantastic, premium-feel loading animation with multiple pulsating rings and gradients
 */
export function PremiumPageLoader({
  message = "Loading experience...",
  subMessage = "Optimizing your dashboard..."
}: {
  message?: string;
  subMessage?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 p-6 text-center animate-in fade-in duration-300">
      <div className="pink-purple-spinner bg-dark-blue shadow-2xl shadow-purple-500/20"></div>

      <div className="space-y-2">
        <h3 className="text-base sm:text-lg font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-pulse tracking-tight">
          {message}
        </h3>
        <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-500 font-bold uppercase tracking-[0.2em] opacity-80">
          {subMessage}
        </p>
      </div>
    </div>
  );
}
