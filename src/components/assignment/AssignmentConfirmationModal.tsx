"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
    Timer,
    Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    onRevert: () => void;
    title: string;
    description: string;
    summaryText: string;
    stagingData: Array<{
        id: string;
        columns: Array<{ label: string; value: string }>;
        status?: "pending" | "success" | "error";
    }>;
    columnHeaders: string[];
    timerDuration?: number; // in seconds, default 120
    processing?: boolean;
}

export function AssignmentConfirmationModal({
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
}: ConfirmationModalProps) {
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
        if (timeRemaining > 60) return "text-green-500";
        if (timeRemaining > 30) return "text-yellow-500";
        return "text-red-500";
    };

    const handleConfirm = async () => {
        setIsTimerActive(false);
        await onConfirm();
    };

    const handleRevert = () => {
        setIsTimerActive(false);
        onRevert();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleRevert()}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="space-y-3">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Shield className="w-6 h-6 text-orange-500" />
                            {title}
                        </DialogTitle>

                        {/* Timer Display */}
                        <div className="flex items-center gap-2">
                            <div
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all",
                                    timeRemaining > 60
                                        ? "border-green-500/30 bg-green-500/10"
                                        : timeRemaining > 30
                                            ? "border-yellow-500/30 bg-yellow-500/10"
                                            : "border-red-500/30 bg-red-500/10 animate-pulse"
                                )}
                            >
                                <Timer className={cn("w-5 h-5", getTimerColor())} />
                                <span className={cn("font-mono text-lg font-bold", getTimerColor())}>
                                    {formatTime(timeRemaining)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <DialogDescription className="text-sm">
                        {description}
                    </DialogDescription>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <motion.div
                            className={cn(
                                "h-full rounded-full transition-colors",
                                timeRemaining > 60
                                    ? "bg-green-500"
                                    : timeRemaining > 30
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                            )}
                            initial={{ width: "100%" }}
                            animate={{ width: `${progressPercentage}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                </DialogHeader>

                {/* Summary Text */}
                <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-lg border border-orange-200 dark:border-orange-800 my-3">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                            {summaryText}
                        </p>
                    </div>
                </div>

                {/* Staging Table */}
                <div className="flex-1 min-h-0">
                    <ScrollArea className="h-[300px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-zinc-100 dark:bg-zinc-800">
                                    <TableHead className="text-xs font-semibold w-12">Sl.</TableHead>
                                    {columnHeaders.map((header, idx) => (
                                        <TableHead key={idx} className="text-xs font-semibold">
                                            {header}
                                        </TableHead>
                                    ))}
                                    <TableHead className="text-xs font-semibold w-20">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stagingData.map((row, idx) => (
                                    <TableRow
                                        key={row.id}
                                        className={cn(
                                            "transition-colors",
                                            row.status === "success" && "bg-green-50 dark:bg-green-950/20",
                                            row.status === "error" && "bg-red-50 dark:bg-red-950/20"
                                        )}
                                    >
                                        <TableCell className="text-xs font-medium">{idx + 1}</TableCell>
                                        {row.columns.map((col, colIdx) => (
                                            <TableCell key={colIdx} className="text-xs">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{col.value}</span>
                                                    {col.label && (
                                                        <span className="text-[10px] text-muted-foreground">
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
                                                <Badge className="bg-zinc-500 text-white text-[10px]">
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

                {/* Timer Warning */}
                {timeRemaining <= 30 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800"
                    >
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <p className="text-sm text-red-600 dark:text-red-400">
                            <strong>Warning:</strong> Action will automatically revert in{" "}
                            {timeRemaining} seconds if not confirmed.
                        </p>
                    </motion.div>
                )}

                <DialogFooter className="flex justify-between items-center gap-4 pt-4 border-t">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Shield className="w-4 h-4" />
                        <span>All changes are atomic and reversible until confirmed</span>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={handleRevert}
                            disabled={processing}
                            className="min-w-[120px] border-red-300 text-red-600 hover:bg-red-50"
                        >
                            <Undo2 className="w-4 h-4 mr-2" />
                            Revert
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={processing}
                            className="min-w-[180px] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default AssignmentConfirmationModal;
