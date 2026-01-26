'use client';

/**
 * SecureQRDisplay Component
 * 
 * Displays an encrypted, time-limited QR code for student bus pass verification.
 * 
 * SECURITY FEATURES:
 * - Fetches encrypted QR token from secure API
 * - Auto-refreshes before expiration
 * - Shows expiration countdown
 * - Tamper-proof encrypted payload
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Shield,
    RefreshCw,
    Clock,
    CheckCircle,
    AlertTriangle,
    Share2,
    Download,
    Lock,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SecureQRDisplayProps {
    studentUid: string;
    studentName: string;
    enrollmentId: string;
    isActive: boolean;
    onTokenRefresh?: () => void;
}

interface TokenInfo {
    token: string;
    expiresIn: number;
    generatedAt: number;
}

export default function SecureQRDisplay({
    studentUid,
    studentName,
    enrollmentId,
    isActive,
    onTokenRefresh
}: SecureQRDisplayProps) {
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);
    const [showQR, setShowQR] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);
    const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch secure QR token from API
    const fetchSecureToken = useCallback(async () => {
        if (!studentUid || !isActive) return;

        setLoading(true);
        setError(null);

        try {
            // Get auth token
            const { getAuth } = await import('firebase/auth');
            const auth = getAuth();
            const currentUser = auth.currentUser;

            if (!currentUser) {
                throw new Error('Not authenticated');
            }

            const idToken = await currentUser.getIdToken();

            const response = await fetch('/api/bus-pass/generate-secure-qr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ studentUid })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to generate secure QR');
            }

            const newTokenInfo: TokenInfo = {
                token: data.token,
                expiresIn: data.expiresIn,
                generatedAt: Date.now()
            };

            setTokenInfo(newTokenInfo);
            setTimeRemaining(data.expiresIn);
            setShowQR(true);

            // Schedule refresh 5 minutes before expiration
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
            }
            refreshTimeoutRef.current = setTimeout(() => {
                fetchSecureToken();
                onTokenRefresh?.();
            }, data.expiresIn - 5 * 60 * 1000);

            console.log('✅ Secure QR token generated');

        } catch (err: any) {
            console.error('Error fetching secure token:', err);
            setError(err.message || 'Failed to generate QR code');
            toast.error('Failed to generate secure QR code');
        } finally {
            setLoading(false);
        }
    }, [studentUid, isActive, onTokenRefresh]);

    // Update countdown timer
    useEffect(() => {
        if (!tokenInfo) return;

        const interval = setInterval(() => {
            const elapsed = Date.now() - tokenInfo.generatedAt;
            const remaining = tokenInfo.expiresIn - elapsed;

            if (remaining <= 0) {
                setTimeRemaining(0);
                setTokenInfo(null);
                setShowQR(false);
            } else {
                setTimeRemaining(remaining);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [tokenInfo]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, []);

    // Format time remaining
    const formatTimeRemaining = (ms: number): string => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    };

    // Handle share
    const handleShare = async () => {
        if (!tokenInfo) return;

        const shareText = `Bus Pass - ${studentName}\nEnrollment: ${enrollmentId}\nStatus: ${isActive ? 'ACTIVE' : 'INACTIVE'}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'AdtU Digital Bus Pass',
                    text: shareText
                });
            } else {
                await navigator.clipboard.writeText(shareText);
                toast.success('Pass details copied to clipboard');
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                toast.error('Failed to share');
            }
        }
    };

    // Handle download
    const handleDownload = async () => {
        if (!qrRef.current || !tokenInfo) return;

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const scale = 4;
            const width = 400;
            const height = 550;
            canvas.width = width * scale;
            canvas.height = height * scale;
            ctx.scale(scale, scale);

            // Background
            ctx.fillStyle = '#020817';
            ctx.beginPath();
            ctx.roundRect(0, 0, width, height, 24);
            ctx.fill();

            // Header
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.fillRect(0, 0, width, 70);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Assam down town University', width / 2, 35);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '600 11px Inter, system-ui, sans-serif';
            ctx.fillText('Secure Digital Bus Pass', width / 2, 55);

            // Student info
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '600 10px Inter, system-ui, sans-serif';
            ctx.fillText('STUDENT', width / 2, 95);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Inter, system-ui, sans-serif';
            ctx.fillText(studentName, width / 2, 120);

            // QR Code
            const qrCanvas = qrRef.current.querySelector('canvas');
            if (qrCanvas) {
                const qrSize = 200;
                const qrX = (width - qrSize) / 2;
                const qrY = 150;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 16);
                ctx.fill();

                ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
            }

            // Security badge
            ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            ctx.beginPath();
            ctx.roundRect(width / 2 - 70, 380, 140, 28, 14);
            ctx.fill();

            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.fillText('🔒 END-TO-END ENCRYPTED', width / 2, 398);

            // Enrollment ID
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.roundRect(30, 430, width - 60, 50, 12);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '600 9px Inter, system-ui, sans-serif';
            ctx.fillText('ENROLLMENT ID', width / 2, 450);

            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(enrollmentId, width / 2, 470);

            // Footer
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '500 9px Inter, system-ui, sans-serif';
            ctx.fillText('This pass is cryptographically secured', width / 2, 520);
            ctx.fillText(`Generated: ${new Date().toLocaleString()}`, width / 2, 535);

            // Download
            const link = document.createElement('a');
            link.download = `SecureBusPass_${studentName.replace(/\s+/g, '_')}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();

            toast.success('Secure bus pass downloaded');
        } catch (err) {
            console.error('Download error:', err);
            toast.error('Failed to download pass');
        }
    };

    // Render
    if (!isActive) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center">
                <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Service Inactive</h3>
                <p className="text-sm text-gray-400">Please renew your bus service to access your QR code.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <AnimatePresence mode="wait">
                {!showQR ? (
                    <motion.div
                        key="generate"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex flex-col items-center"
                    >
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 mb-4">
                            <Lock className="w-12 h-12 text-blue-400 mb-3 mx-auto" />
                            <p className="text-sm text-gray-300 text-center mb-1">
                                Your QR code is secured with
                            </p>
                            <p className="text-xs text-blue-400 font-bold text-center">
                                AES-256-GCM ENCRYPTION
                            </p>
                        </div>

                        <Button
                            onClick={fetchSecureToken}
                            disabled={loading}
                            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4 mr-2" />
                                    Generate Secure QR
                                </>
                            )}
                        </Button>

                        {error && (
                            <p className="text-sm text-red-400 mt-3">{error}</p>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="display"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex flex-col items-center w-full"
                    >
                        {/* Status bar */}
                        <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-400">ENCRYPTED & ACTIVE</span>
                        </div>

                        {/* QR Code */}
                        <div className="relative">
                            <div className="absolute -inset-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl opacity-60"></div>

                            <div
                                ref={qrRef}
                                className="relative bg-white p-4 rounded-xl shadow-2xl"
                            >
                                {tokenInfo && (
                                    <QRCodeCanvas
                                        value={tokenInfo.token}
                                        size={180}
                                        level="H"
                                        includeMargin={false}
                                    />
                                )}
                            </div>

                            {/* Corner decorations */}
                            <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-blue-400 rounded-tl-xl"></div>
                            <div className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-purple-400 rounded-tr-xl"></div>
                            <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-purple-400 rounded-bl-xl"></div>
                            <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-blue-400 rounded-br-xl"></div>
                        </div>

                        {/* Expiration countdown */}
                        <div className="flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-gray-800/50 border border-gray-700">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-xs text-gray-300">
                                Valid for: <span className="font-bold text-white">{formatTimeRemaining(timeRemaining)}</span>
                            </span>
                        </div>

                        {/* Student info */}
                        <div className="mt-4 text-center">
                            <p className="text-lg font-bold text-white">{studentName}</p>
                            <p className="text-sm text-blue-400 font-mono">{enrollmentId}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-6">
                            <Button
                                onClick={handleShare}
                                variant="outline"
                                className="px-4 py-2 text-xs font-bold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border-white/10"
                            >
                                <Share2 className="w-4 h-4 mr-2" />
                                Share
                            </Button>

                            <Button
                                onClick={handleDownload}
                                variant="outline"
                                className="px-4 py-2 text-xs font-bold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border-white/10"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Download
                            </Button>

                            <Button
                                onClick={fetchSecureToken}
                                disabled={loading}
                                variant="outline"
                                className="px-4 py-2 text-xs font-bold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border-white/10"
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>

                        {/* Security note */}
                        <p className="mt-4 text-[10px] text-gray-500 text-center max-w-[280px]">
                            🔒 This QR code is encrypted end-to-end and will auto-refresh before expiration.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
