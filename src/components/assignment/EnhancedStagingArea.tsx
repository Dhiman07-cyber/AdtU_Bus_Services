"use client";

/**
 * Enhanced Staging Area Components
 * 
 * Works with the new staging row model (bus-centered operations).
 * Supports both driver assignment and route staging.
 */

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
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Trash2,
    ArrowRightLeft,
    CheckCircle2,
    XCircle,
    Bus,
    User,
    Route,
    Info,
    Bookmark,
    Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
    DriverStagingRow,
    RouteStagingRow,
    StagingRow
} from "@/lib/staging/stagingModel";

// ============================================
// DESIGN TOKENS
// ============================================
const tokens = {
    primaryOrange: "#FF7A2D",
    primaryOrangeGlow: "rgba(255, 122, 45, 0.12)",
    deepPurple: "#6B46C1",
    darkBg: "#0F172A",
    cardBg: "#0B1220",
    headerBg: "linear-gradient(135deg, rgba(255, 122, 45, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)",
    rowHover: "rgba(255, 255, 255, 0.02)",
    success: "#10B981",
    reserved: "#F59E0B",
    swapped: "#8B5CF6",
    info: "#3B82F6",
    textPrimary: "#F8FAFC",
    textSecondary: "#E2E8F0",
    textMuted: "#94A3B8",
    borderDark: "#1E293B",
    borderLight: "rgba(255, 255, 255, 0.06)",
};

// ============================================
// ENHANCED DRIVER STAGING AREA - PREMIUM REDESIGN
// ============================================
interface EnhancedDriverStagingAreaProps {
    staging: DriverStagingRow[];
    onRemove: (id: string) => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isConfirmDisabled?: boolean;
    commitResults?: Map<string, 'success' | 'error'>;
}

export function EnhancedDriverStagingArea({
    staging,
    onRemove,
    onClearAll,
    onConfirm,
    isConfirmDisabled = false,
    commitResults,
}: EnhancedDriverStagingAreaProps) {
    const isEmpty = staging.length === 0;

    const getInfoTooltip = (row: DriverStagingRow): string => {
        const busLabel = row.busLabel;
        const newDriver = row.newOperator.name;
        const prevOperator = row.previousOperator.name;
        const prevBusId = row.newOperator.previousBusId;

        let text = `${busLabel}`;
        if (prevOperator) {
            text += ` was driven by ${prevOperator}.`;
            if (row.changeType === "reserve" || !row.isSwap) text += ` They will now be Reserved.`;
            else if (row.changeType === "swap") text += ` They will be swapped to the other bus.`;
        } else text += ` had no driver (Bus was Available).`;

        text += ` ${newDriver}`;
        if (prevBusId) text += `, previously on another bus,`;
        else text += `, previously Reserved,`;
        text += ` will operate this bus.`;

        return text;
    };

    const getRowStatus = (rowId: string): 'pending' | 'success' | 'error' => {
        if (!commitResults) return 'pending';
        return commitResults.get(rowId) || 'pending';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn(
                "w-full rounded-2xl border backdrop-blur-sm transition-all duration-500 overflow-hidden",
                isEmpty ? "p-4 shadow-sm" : "shadow-2xl"
            )}
            style={{
                backgroundColor: tokens.cardBg,
                borderColor: tokens.borderDark
            }}
        >
            {isEmpty ? (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner"
                            style={{ backgroundColor: tokens.primaryOrangeGlow }}
                        >
                            <ArrowRightLeft className="w-5 h-5" style={{ color: tokens.primaryOrange }} />
                        </div>
                        <div>
                            <p className="text-sm font-medium" style={{ color: tokens.textSecondary }}>
                                No assignments staged
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <div
                        className="relative flex items-center justify-between px-6 py-5 border-b"
                        style={{
                            background: tokens.headerBg,
                            borderColor: tokens.borderLight
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform transition-transform hover:scale-105"
                                style={{
                                    backgroundColor: tokens.primaryOrange,
                                    boxShadow: `0 8px 20px ${tokens.primaryOrange}40`
                                }}
                            >
                                <ArrowRightLeft className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold tracking-tight" style={{ color: tokens.textPrimary }}>
                                    Driver Staging Area
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: tokens.primaryOrange }} />
                                    <p className="text-sm font-medium" style={{ color: tokens.textMuted }}>
                                        {staging.length} driver {staging.length === 1 ? 'assignment' : 'assignments'} ready to commit
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClearAll}
                                className="h-10 px-4 rounded-xl text-sm font-semibold transition-all hover:bg-red-500/10 hover:text-red-400 text-red-500/80"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Cancel All
                            </Button>
                            <Button
                                size="sm"
                                onClick={onConfirm}
                                disabled={isConfirmDisabled}
                                className="h-10 px-6 rounded-xl text-sm font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    backgroundColor: tokens.primaryOrange,
                                    boxShadow: `0 4px 15px ${tokens.primaryOrange}40`
                                }}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Confirm Changes
                            </Button>
                        </div>
                    </div>

                    {/* Table */}
                    <ScrollArea className="max-h-[500px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-b" style={{ borderColor: tokens.borderLight, backgroundColor: "rgba(0,0,0,0.2)" }}>
                                    <TableHead className="py-4 px-6 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>#</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>Bus</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>Current Operator</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>Impact</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>Proposed Change</TableHead>
                                    <TableHead className="py-4 px-6 text-[11px] uppercase tracking-wider font-bold text-right" style={{ color: tokens.textMuted }}>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence mode="popLayout">
                                    {staging.map((row, idx) => {
                                        const status = getRowStatus(row.id);
                                        return (
                                            <motion.tr
                                                key={row.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                layout
                                                className={cn(
                                                    "group transition-colors border-b last:border-0 hover:bg-white/[0.02]",
                                                    status === "success" && "bg-emerald-500/10",
                                                    status === "error" && "bg-red-500/10"
                                                )}
                                                style={{ borderColor: tokens.borderLight }}
                                            >
                                                {/* SI. No */}
                                                <TableCell className="py-5 px-6">
                                                    <span className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border"
                                                        style={{ borderColor: tokens.borderLight, color: tokens.textMuted, backgroundColor: "rgba(255,255,255,0.03)" }}>
                                                        {idx + 1}
                                                    </span>
                                                </TableCell>

                                                {/* Bus */}
                                                <TableCell className="py-5 px-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform"
                                                            style={{ backgroundColor: tokens.primaryOrangeGlow }}
                                                        >
                                                            <Bus className="w-4.5 h-4.5" style={{ color: tokens.primaryOrange }} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold tracking-tight" style={{ color: tokens.textPrimary }}>
                                                                {row.busLabel === "Reserved" && row.newOperator.previousBusId
                                                                    ? row.newOperator.previousBusId
                                                                    : row.busLabel}
                                                            </p>
                                                            <p className="text-[10px] font-medium uppercase tracking-wide opacity-50" style={{ color: tokens.textMuted }}>
                                                                {row.busLabel === "Reserved" ? "Reserved Pool" : "Unit Center"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>

                                                {/* Previous Operator */}
                                                <TableCell className="py-5 px-4">
                                                    {row.previousOperator.name ? (
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1 h-1 rounded-full bg-red-400" />
                                                                <p className="text-sm font-semibold text-red-200/80">
                                                                    {row.previousOperator.name}
                                                                </p>
                                                            </div>
                                                            <p className="text-[10px] mt-0.5 ml-2.5 font-mono" style={{ color: tokens.textMuted }}>
                                                                {row.previousOperator.employeeId}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 px-3 py-1 transparent rounded-full border border-dashed text-[11px] font-medium" style={{ borderColor: tokens.borderLight, color: tokens.textMuted }}>
                                                            <Bookmark className="w-3 h-3" />
                                                            Available / Reserved
                                                        </div>
                                                    )}
                                                </TableCell>

                                                {/* Impact */}
                                                <TableCell className="py-5 px-4">
                                                    {row.isSwap ? (
                                                        <Badge
                                                            className="rounded-lg px-2.5 py-1 text-[10px] font-bold border-0 shadow-sm"
                                                            style={{
                                                                backgroundColor: "rgba(139, 92, 246, 0.12)",
                                                                color: "#A78BFA"
                                                            }}
                                                        >
                                                            <ArrowRightLeft className="w-3 h-3 mr-1.5" />
                                                            Swapped to other bus
                                                        </Badge>
                                                    ) : row.previousOperator.driverUid ? (
                                                        <Badge
                                                            className="rounded-lg px-2.5 py-1 text-[10px] font-bold border-0 shadow-sm"
                                                            style={{
                                                                backgroundColor: "rgba(245, 158, 11, 0.12)",
                                                                color: "#FBBF24"
                                                            }}
                                                        >
                                                            <Bookmark className="w-3 h-3 mr-1.5" />
                                                            Moved to Reserved
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-[11px] font-medium italic opacity-40 ml-2" style={{ color: tokens.textMuted }}>
                                                            No side effect
                                                        </span>
                                                    )}
                                                </TableCell>

                                                {/* New Operator */}
                                                <TableCell className="py-5 px-4">
                                                    <div className="flex flex-col p-2.5 rounded-xl border bg-white/[0.01]" style={{ borderColor: tokens.borderLight }}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                                                    <User className="w-3 h-3 text-blue-400" />
                                                                </div>
                                                                <p className="text-sm font-bold" style={{ color: tokens.textPrimary }}>
                                                                    {row.newOperator.name}
                                                                </p>
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] h-4 px-1 opacity-60 border-blue-400/30 text-blue-300">
                                                                {row.newOperator.employeeId}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: tokens.borderLight }}>
                                                            <Clock className="w-2.5 h-2.5 text-blue-400/60" />
                                                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: tokens.textMuted }}>
                                                                Initial: <span className="text-blue-300/80">{row.newOperator.previousBusId ? "Other Bus" : "Reserved"}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>

                                                {/* Actions */}
                                                <TableCell className="py-5 px-6 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-9 w-9 p-0 rounded-xl hover:bg-blue-500/10"
                                                                    >
                                                                        <Info className="w-4 h-4 text-blue-400/70" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top" className="w-64 p-3 bg-[#1e293b] border-[#334155] rounded-xl text-xs shadow-2xl">
                                                                    <p className="leading-relaxed text-slate-300">{getInfoTooltip(row)}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => onRemove(row.id)}
                                                            className="h-9 w-9 p-0 rounded-xl hover:bg-red-500/10 group/del"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-400/60 group-hover/del:text-red-400 transition-colors" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </>
            )}
        </motion.div>
    );
}

// ============================================
// ENHANCED ROUTE STAGING AREA - PREMIUM REDESIGN
// ============================================
interface EnhancedRouteStagingAreaProps {
    staging: RouteStagingRow[];
    onRemove: (id: string) => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isConfirmDisabled?: boolean;
    commitResults?: Map<string, 'success' | 'error'>;
}

export function EnhancedRouteStagingArea({
    staging,
    onRemove,
    onClearAll,
    onConfirm,
    isConfirmDisabled = false,
    commitResults,
}: EnhancedRouteStagingAreaProps) {
    const isEmpty = staging.length === 0;

    const getRowStatus = (rowId: string): 'pending' | 'success' | 'error' => {
        if (!commitResults) return 'pending';
        return commitResults.get(rowId) || 'pending';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn(
                "w-full rounded-2xl border backdrop-blur-sm transition-all duration-500 overflow-hidden",
                isEmpty ? "p-4 shadow-sm" : "shadow-2xl"
            )}
            style={{
                backgroundColor: tokens.cardBg,
                borderColor: tokens.borderDark
            }}
        >
            {isEmpty ? (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner"
                            style={{ backgroundColor: tokens.primaryOrangeGlow }}
                        >
                            <Route className="w-5 h-5" style={{ color: tokens.primaryOrange }} />
                        </div>
                        <div>
                            <p className="text-sm font-medium" style={{ color: tokens.textSecondary }}>
                                No route changes staged
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <div
                        className="relative flex items-center justify-between px-6 py-5 border-b"
                        style={{
                            background: tokens.headerBg,
                            borderColor: tokens.borderLight
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                                style={{
                                    backgroundColor: tokens.primaryOrange,
                                    boxShadow: `0 8px 20px ${tokens.primaryOrange}40`
                                }}
                            >
                                <Route className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold tracking-tight" style={{ color: tokens.textPrimary }}>
                                    Route Staging Area
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: tokens.primaryOrange }} />
                                    <p className="text-sm font-medium" style={{ color: tokens.textMuted }}>
                                        {staging.length} route {staging.length === 1 ? 'update' : 'updates'} ready to commit
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClearAll}
                                className="h-10 px-4 rounded-xl text-sm font-semibold transition-all hover:bg-red-500/10 hover:text-red-400 text-red-500/80"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Cancel All
                            </Button>
                            <Button
                                size="sm"
                                onClick={onConfirm}
                                disabled={isConfirmDisabled}
                                className="h-10 px-6 rounded-xl text-sm font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                                style={{
                                    backgroundColor: tokens.primaryOrange,
                                    boxShadow: `0 4px 15px ${tokens.primaryOrange}40`
                                }}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Confirm Changes
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="max-h-[500px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-b" style={{ borderColor: tokens.borderLight, backgroundColor: "rgba(0,0,0,0.2)" }}>
                                    <TableHead className="py-4 px-6 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>#</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>Vehicle</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>From Route</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>To Route</TableHead>
                                    <TableHead className="py-4 px-4 text-[11px] uppercase tracking-wider font-bold" style={{ color: tokens.textMuted }}>Details</TableHead>
                                    <TableHead className="py-4 px-6 text-[11px] uppercase tracking-wider font-bold text-right" style={{ color: tokens.textMuted }}>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence mode="popLayout">
                                    {staging.map((row, idx) => {
                                        const status = getRowStatus(row.id);
                                        return (
                                            <motion.tr
                                                key={row.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                layout
                                                className={cn(
                                                    "group transition-colors border-b last:border-0 hover:bg-white/[0.02]",
                                                    status === "success" && "bg-emerald-500/10",
                                                    status === "error" && "bg-red-500/10"
                                                )}
                                                style={{ borderColor: tokens.borderLight }}
                                            >
                                                <TableCell className="py-5 px-6">
                                                    <span className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border"
                                                        style={{ borderColor: tokens.borderLight, color: tokens.textMuted, backgroundColor: "rgba(255,255,255,0.03)" }}>
                                                        {idx + 1}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-5 px-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform"
                                                            style={{ backgroundColor: tokens.primaryOrangeGlow }}
                                                        >
                                                            <Bus className="w-4.5 h-4.5" style={{ color: tokens.primaryOrange }} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold tracking-tight" style={{ color: tokens.textPrimary }}>{row.busLabel}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-5 px-4">
                                                    {row.previousRouteName ? (
                                                        <div className="flex items-center px-3 py-1 bg-red-500/5 border border-red-500/20 rounded-lg">
                                                            <span className="text-xs font-medium text-red-200/60 line-through">
                                                                {row.previousRouteName}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs font-medium italic opacity-30" style={{ color: tokens.textMuted }}>Unassigned</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-5 px-4">
                                                    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                                        <Route className="w-3.5 h-3.5 text-emerald-400" />
                                                        <span className="text-xs font-bold text-emerald-100">
                                                            {row.newRouteName}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-5 px-4">
                                                    <Badge
                                                        className="rounded-lg px-2.5 py-1 text-[10px] font-bold border-0 shadow-sm"
                                                        style={{
                                                            backgroundColor: tokens.primaryOrangeGlow,
                                                            color: tokens.primaryOrange
                                                        }}
                                                    >
                                                        {row.newRouteStopsCount} stops
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-5 px-6 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onRemove(row.id)}
                                                        className="h-9 w-9 p-0 rounded-xl hover:bg-red-500/10 group/del"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400/60 group-hover/del:text-red-400 transition-colors" />
                                                    </Button>
                                                </TableCell>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </>
            )}
        </motion.div>
    );
}

// ============================================
// GENERIC STAGING AREA - PREMIUM REDESIGN
// ============================================
interface GenericStagingAreaProps {
    staging: StagingRow[];
    onRemove: (id: string) => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isConfirmDisabled?: boolean;
    commitResults?: Map<string, 'success' | 'error'>;
}

export function GenericStagingArea({
    staging,
    onRemove,
    onClearAll,
    onConfirm,
    isConfirmDisabled = false,
    commitResults,
}: GenericStagingAreaProps) {
    const driverStaging = staging.filter((r): r is DriverStagingRow => r.type === 'driver');
    const routeStaging = staging.filter((r): r is RouteStagingRow => r.type === 'route');

    if (driverStaging.length > 0 && routeStaging.length === 0) {
        return (
            <EnhancedDriverStagingArea
                staging={driverStaging}
                onRemove={onRemove}
                onClearAll={onClearAll}
                onConfirm={onConfirm}
                isConfirmDisabled={isConfirmDisabled}
                commitResults={commitResults}
            />
        );
    }

    if (routeStaging.length > 0 && driverStaging.length === 0) {
        return (
            <EnhancedRouteStagingArea
                staging={routeStaging}
                onRemove={onRemove}
                onClearAll={onClearAll}
                onConfirm={onConfirm}
                isConfirmDisabled={isConfirmDisabled}
                commitResults={commitResults}
            />
        );
    }

    if (staging.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full rounded-2xl border py-6 px-8 text-center"
                style={{
                    backgroundColor: tokens.cardBg,
                    borderColor: tokens.borderDark
                }}
            >
                <div className="flex flex-col items-center gap-4">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner"
                        style={{ backgroundColor: tokens.primaryOrangeGlow }}
                    >
                        <ArrowRightLeft className="w-7 h-7" style={{ color: tokens.primaryOrange }} />
                    </div>
                    <div>
                        <p className="text-base font-bold" style={{ color: tokens.textPrimary }}>
                            No assignments staged
                        </p>
                        <p className="text-sm mt-1" style={{ color: tokens.textMuted }}>
                            Select items from the options above to stage changes.
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-6">
            {driverStaging.length > 0 && (
                <EnhancedDriverStagingArea
                    staging={driverStaging}
                    onRemove={onRemove}
                    onClearAll={onClearAll}
                    onConfirm={onConfirm}
                    isConfirmDisabled={isConfirmDisabled}
                    commitResults={commitResults}
                />
            )}
            {routeStaging.length > 0 && (
                <EnhancedRouteStagingArea
                    staging={routeStaging}
                    onRemove={onRemove}
                    onClearAll={onClearAll}
                    onConfirm={onConfirm}
                    isConfirmDisabled={isConfirmDisabled}
                    commitResults={commitResults}
                />
            )}
        </div>
    );
}
