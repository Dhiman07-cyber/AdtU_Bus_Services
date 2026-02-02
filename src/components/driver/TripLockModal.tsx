/**
 * TripLockModal Component
 * 
 * Modal displayed when a driver is denied access to operate a bus
 * because another driver has the lock.
 * 
 * No admin intervention - just informational with retry option.
 */

'use client';

import React from 'react';

interface TripLockModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRetry?: () => void;
}

export function TripLockModal({
    isOpen,
    onClose,
    onRetry
}: TripLockModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header with warning indicator */}
                <div className="bg-amber-500 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <svg
                                className="w-8 h-8 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white">
                            Bus Currently In Use
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-5">
                    <p className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
                        This bus is currently being operated by another driver. Please wait or try again later.
                    </p>

                    <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            <strong>What to do:</strong>
                        </p>
                        <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                            <li>• Wait for the current trip to end</li>
                            <li>• The lock will be automatically released when the trip ends</li>
                            <li>• Check if you&apos;re assigned to a different bus</li>
                        </ul>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 flex gap-3 justify-end">
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        >
                            Try Again
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 rounded-lg transition-colors"
                    >
                        Understood
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TripLockModal;
