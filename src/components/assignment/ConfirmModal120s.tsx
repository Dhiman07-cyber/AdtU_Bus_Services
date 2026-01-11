"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    RefreshCw,
    Shield,
    XCircle,
    Undo2,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// DESIGN TOKENS
// ============================================
const tokens = {
    primaryOrange: "#FF7A2D",
    deepPurple: "#6B46C1",
    darkBg: "#0F1724",
    cardBg: "#0B1220",
    success: "#13A16A",
    textPrimary: "#E6EEF2",
    textMuted: "#98A0A8",
    borderDark: "#141A22",
};

// ============================================
// TYPES
// ============================================
interface StagingRow {
    id: string;
    columns: Array<{ label: string; value: string }>;
    status?: "pending" | "success" | "error";
}

interface ConfirmModal120sProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    onRevert: () => void;
    title: string;
    description: string;
    summaryText: string;
    stagingData: StagingRow[];
    columnHeaders: string[];
    timerDuration?: number; // in seconds, default 120
    processing?: boolean;
    pageType?: "driver" | "route";
}

// ============================================
// CONFIRM MODAL COMPONENT
// ============================================
export function ConfirmModal120s({
    isOpen,
    onClose,
    onConfirm,
    onRevert,
    title,
    description,
    summaryText,
    stagingData,
    columnHeaders,
    timerDuration = 120,
    processing = false,
    pageType = "driver",
}: ConfirmModal120sProps) {
    const [timeRemaining, setTimeRemaining] = useState(timerDuration);
    const [isTimerActive, setIsTimerActive] = useState(false);

    // Start timer when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeRemaining(timerDuration);
            setIsTimerActive(true);
        } else {
            setIsTimerActive(false);
        }
    }, [isOpen, timerDuration]);

    // Countdown timer
    useEffect(() => {
        if (!isTimerActive || timeRemaining <= 0) return;

        const interval = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev <= 1) {
                    // Timer expired - auto revert
                    setIsTimerActive(false);
                    onRevert();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isTimerActive, timeRemaining, onRevert]);

    // Format time display
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Calculate progress percentage
    const progressPercentage = (timeRemaining / timerDuration) * 100;

    // Determine timer color based on remaining time
    const getTimerColor = () => {
        if (timeRemaining > 60) return tokens.success;
        if (timeRemaining > 30) return "#E6A700";
        return "#EF4444";
    };

    const handleConfirm = async () => {
        setIsTimerActive(false);
        await onConfirm();
    };

    const handleRevert = () => {
        setIsTimerActive(false);
        onRevert();
    };

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                handleRevert();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-modal-title"
            >
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={handleRevert}
                />

                {/* Modal */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="relative w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl"
                    style={{ backgroundColor: tokens.cardBg }}
                >
                    {/* Close button */}
                    <button
                        onClick={handleRevert}
                        className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" style={{ color: tokens.textMuted }} />
                    </button>

                    {/* Header with Timer */}
                    <div
                        className="px-6 py-4 border-b"
                        style={{ borderColor: tokens.borderDark }}
                    >
                        <div className="flex items-center justify-between pr-10">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{ backgroundColor: tokens.primaryOrange }}
                                >
                                    <Shield className="w-5 h-5 text-white" />
                                </div>
                                <h2
                                    id="confirm-modal-title"
                                    className="text-xl font-semibold"
                                    style={{ color: tokens.textPrimary }}
                                >
                                    {title}
                                </h2>
                            </div>

                            {/* Timer Display */}
                            <div
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all"
                                style={{
                                    borderColor: `${getTimerColor()}40`,
                                    backgroundColor: `${getTimerColor()}15`,
                                }}
                            >
                                <Clock className="w-5 h-5" style={{ color: getTimerColor() }} />
                                <span
                                    className="font-mono text-lg font-bold"
                                    style={{ color: getTimerColor() }}
                                >
                                    {formatTime(timeRemaining)}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm mt-2" style={{ color: tokens.textMuted }}>
                            {description}
                        </p>

                        {/* Progress Bar */}
                        <div
                            className="w-full h-1.5 rounded-full overflow-hidden mt-4"
                            style={{ backgroundColor: '#1A2332' }}
                        >
                            <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: getTimerColor() }}
                                initial={{ width: "100%" }}
                                animate={{ width: `${progressPercentage}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>

                    {/* Summary Alert */}
                    <div
                        className="mx-6 mt-4 px-4 py-3 rounded-xl border"
                        style={{
                            backgroundColor: `${tokens.primaryOrange}10`,
                            borderColor: `${tokens.primaryOrange}30`
                        }}
                    >
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: tokens.primaryOrange }} />
                            <p className="text-sm" style={{ color: tokens.textPrimary }}>
                                {summaryText}
                            </p>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 min-h-0 px-6 py-4">
                        <ScrollArea className="h-[280px]">
                            <Table>
                                <TableHeader>
                                    <TableRow style={{ backgroundColor: '#0D1520' }}>
                                        <TableHead className="text-xs font-semibold w-12" style={{ color: tokens.textMuted }}>
                                            Sl.
                                        </TableHead>
                                        {columnHeaders.map((header, idx) => (
                                            <TableHead
                                                key={idx}
                                                className="text-xs font-semibold"
                                                style={{ color: tokens.textMuted }}
                                            >
                                                {header}
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-xs font-semibold w-20" style={{ color: tokens.textMuted }}>
                                            Status
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stagingData.map((row, idx) => (
                                        <TableRow
                                            key={row.id}
                                            className={cn(
                                                "transition-colors",
                                                row.status === "success" && "bg-green-950/20",
                                                row.status === "error" && "bg-red-950/20"
                                            )}
                                            style={{ borderColor: tokens.borderDark }}
                                        >
                                            <TableCell className="text-xs font-medium" style={{ color: tokens.textPrimary }}>
                                                {idx + 1}
                                            </TableCell>
                                            {row.columns.map((col, colIdx) => (
                                                <TableCell key={colIdx} className="text-xs">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium" style={{ color: tokens.textPrimary }}>
                                                            {col.value}
                                                        </span>
                                                        {col.label && (
                                                            <span className="text-[10px]" style={{ color: tokens.textMuted }}>
                                                                {col.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            ))}
                                            <TableCell>
                                                {row.status === "success" ? (
                                                    <Badge className="bg-green-500 text-white text-[10px]">
                                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                                        Done
                                                    </Badge>
                                                ) : row.status === "error" ? (
                                                    <Badge className="bg-red-500 text-white text-[10px]">
                                                        <XCircle className="w-3 h-3 mr-1" />
                                                        Failed
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        className="text-[10px]"
                                                        style={{ backgroundColor: '#374151', color: tokens.textPrimary }}
                                                    >
                                                        <Clock className="w-3 h-3 mr-1" />
                                                        Pending
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>

                    {/* Warning when timer low */}
                    <AnimatePresence>
                        {timeRemaining <= 30 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mx-6 mb-4"
                            >
                                <div
                                    className="flex items-center gap-2 px-4 py-3 rounded-xl border"
                                    style={{
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                        borderColor: 'rgba(239, 68, 68, 0.3)'
                                    }}
                                >
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                    <p className="text-sm text-red-400">
                                        <strong>Warning:</strong> Action will automatically revert in {timeRemaining} seconds if not confirmed.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Footer */}
                    <div
                        className="px-6 py-4 border-t flex justify-between items-center"
                        style={{ borderColor: tokens.borderDark }}
                    >
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" style={{ color: tokens.textMuted }} />
                            <span className="text-xs" style={{ color: tokens.textMuted }}>
                                All changes are atomic and reversible until confirmed
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={handleRevert}
                                disabled={processing}
                                className="min-w-[120px] border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                                <Undo2 className="w-4 h-4 mr-2" />
                                Revert
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={processing}
                                className="min-w-[180px] text-white"
                                style={{ backgroundColor: tokens.primaryOrange }}
                            >
                                {processing ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        Committing...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Confirm Assignment
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default ConfirmModal120s;
