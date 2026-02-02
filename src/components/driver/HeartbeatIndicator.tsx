/**
 * HeartbeatIndicator Component
 * 
 * Small indicator showing the heartbeat connection status.
 * Displays green pulse when active, yellow when retrying, red when failed.
 */

'use client';

import React from 'react';

interface HeartbeatIndicatorProps {
    status: 'active' | 'failed' | 'stopped';
    lastHeartbeat: string | null;
    className?: string;
}

export function HeartbeatIndicator({
    status,
    lastHeartbeat,
    className = ''
}: HeartbeatIndicatorProps) {
    const getStatusColor = () => {
        switch (status) {
            case 'active':
                return 'bg-green-500';
            case 'failed':
                return 'bg-red-500';
            case 'stopped':
            default:
                return 'bg-gray-400';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'active':
                return 'Connected';
            case 'failed':
                return 'Connection Lost';
            case 'stopped':
            default:
                return 'Not Active';
        }
    };

    const getTimeSince = () => {
        if (!lastHeartbeat) return null;
        const seconds = Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 1000);
        if (seconds < 5) return 'just now';
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ago`;
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {/* Pulse indicator */}
            <div className="relative">
                <span
                    className={`block w-2.5 h-2.5 rounded-full ${getStatusColor()}`}
                />
                {status === 'active' && (
                    <span
                        className={`absolute inset-0 rounded-full ${getStatusColor()} animate-ping opacity-75`}
                    />
                )}
            </div>

            {/* Status text */}
            <div className="flex flex-col">
                <span className={`text-xs font-medium ${status === 'active' ? 'text-green-600 dark:text-green-400' :
                        status === 'failed' ? 'text-red-600 dark:text-red-400' :
                            'text-gray-500 dark:text-gray-400'
                    }`}>
                    {getStatusText()}
                </span>
                {status === 'active' && lastHeartbeat && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        Last: {getTimeSince()}
                    </span>
                )}
            </div>
        </div>
    );
}

export default HeartbeatIndicator;
