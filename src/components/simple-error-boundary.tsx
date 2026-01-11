"use client";

import React, { useState, useEffect } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function SimpleErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (hasError) {
      console.error('SimpleErrorBoundary caught an error:', error);
    }
  }, [hasError, error]);

  if (hasError) {
    // You can render any custom fallback UI
    return fallback || (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
          <p className="text-gray-600 mb-4">
            {error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => {
              setHasError(false);
              setError(null);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return children;
}