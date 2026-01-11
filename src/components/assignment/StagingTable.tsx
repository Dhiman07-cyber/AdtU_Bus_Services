"use client";

import { useState } from "react";
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
    Edit2,
    ArrowRightLeft,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Info,
    Bus,
    User,
    Route,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StagedDriverAssignment, StagedRouteAssignment } from "@/lib/services/assignment-service";

interface DriverStagingTableProps {
    stagedAssignments: StagedDriverAssignment[];
    onRemove: (id: string) => void;
    onEdit?: (id: string) => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isConfirmDisabled?: boolean;
}

export function DriverStagingTable({
    stagedAssignments,
    onRemove,
    onEdit,
    onClearAll,
    onConfirm,
    isConfirmDisabled = false,
}: DriverStagingTableProps) {
    if (stagedAssignments.length === 0) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 shadow-2xl"
        >
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                            <ArrowRightLeft className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-foreground">
                                Staging Area
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {stagedAssignments.length} driver assignment(s) ready to commit
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClearAll}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                            Cancel All
                        </Button>
                        <Button
                            size="sm"
                            onClick={onConfirm}
                            disabled={isConfirmDisabled}
                            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Confirm Changes
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <ScrollArea className="max-h-[200px]">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-zinc-100 dark:bg-zinc-800">
                                <TableHead className="text-[10px] font-semibold w-12">Sl.</TableHead>
                                <TableHead className="text-[10px] font-semibold">Bus Assigned</TableHead>
                                <TableHead className="text-[10px] font-semibold">Initial Driver</TableHead>
                                <TableHead className="text-[10px] font-semibold">Route Assigned</TableHead>
                                <TableHead className="text-[10px] font-semibold">New Driver</TableHead>
                                <TableHead className="text-[10px] font-semibold w-24">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence>
                                {stagedAssignments.map((assignment, idx) => (
                                    <motion.tr
                                        key={assignment.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className={cn(
                                            "border-b transition-colors",
                                            assignment.status === "success" && "bg-green-50 dark:bg-green-950/20",
                                            assignment.status === "error" && "bg-red-50 dark:bg-red-950/20"
                                        )}
                                    >
                                        <TableCell className="text-xs font-medium">{idx + 1}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Bus className="w-3.5 h-3.5 text-orange-500" />
                                                <div>
                                                    <p className="text-xs font-medium">{assignment.newBusNumber}</p>
                                                    <p className="text-[10px] text-muted-foreground">{assignment.newBusId}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {assignment.oldBusNumber ? (
                                                <div className="flex items-center gap-1">
                                                    <Badge variant="outline" className="text-[10px] line-through opacity-50">
                                                        {assignment.oldBusNumber}
                                                    </Badge>
                                                    <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">None</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="flex items-center gap-1">
                                                            <Route className="w-3 h-3 text-green-500" />
                                                            <span className="text-xs">{assignment.newRouteName || "No Route"}</span>
                                                            {assignment.newRouteName && (
                                                                <Info className="w-3 h-3 text-muted-foreground" />
                                                            )}
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="text-xs">Route ID: {assignment.newRouteId}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <User className="w-3.5 h-3.5 text-blue-500" />
                                                <div>
                                                    <p className="text-xs font-medium">{assignment.driverName}</p>
                                                    <p className="text-[10px] text-muted-foreground">{assignment.driverCode}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {onEdit && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onEdit(assignment.id)}
                                                        className="h-7 w-7 p-0 hover:bg-blue-100"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onRemove(assignment.id)}
                                                    className="h-7 w-7 p-0 hover:bg-red-100"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </motion.div>
    );
}

interface RouteStagingTableProps {
    stagedAssignments: StagedRouteAssignment[];
    onRemove: (id: string) => void;
    onEdit?: (id: string) => void;
    onClearAll: () => void;
    onConfirm: () => void;
    isConfirmDisabled?: boolean;
}

export function RouteStagingTable({
    stagedAssignments,
    onRemove,
    onEdit,
    onClearAll,
    onConfirm,
    isConfirmDisabled = false,
}: RouteStagingTableProps) {
    if (stagedAssignments.length === 0) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 shadow-2xl"
        >
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                            <Route className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-foreground">
                                Staging Area
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {stagedAssignments.length} route assignment(s) ready to commit
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClearAll}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                            Cancel All
                        </Button>
                        <Button
                            size="sm"
                            onClick={onConfirm}
                            disabled={isConfirmDisabled}
                            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Confirm Changes
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <ScrollArea className="max-h-[200px]">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-zinc-100 dark:bg-zinc-800">
                                <TableHead className="text-[10px] font-semibold w-12">Sl.</TableHead>
                                <TableHead className="text-[10px] font-semibold">Bus</TableHead>
                                <TableHead className="text-[10px] font-semibold">Initial Route</TableHead>
                                <TableHead className="text-[10px] font-semibold">New Route</TableHead>
                                <TableHead className="text-[10px] font-semibold">Stop Count</TableHead>
                                <TableHead className="text-[10px] font-semibold w-24">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence>
                                {stagedAssignments.map((assignment, idx) => (
                                    <motion.tr
                                        key={assignment.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className={cn(
                                            "border-b transition-colors",
                                            assignment.status === "success" && "bg-green-50 dark:bg-green-950/20",
                                            assignment.status === "error" && "bg-red-50 dark:bg-red-950/20"
                                        )}
                                    >
                                        <TableCell className="text-xs font-medium">{idx + 1}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Bus className="w-3.5 h-3.5 text-zinc-500" />
                                                <div>
                                                    <p className="text-xs font-medium">{assignment.busNumber}</p>
                                                    <p className="text-[10px] text-muted-foreground">{assignment.busCode}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {assignment.oldRouteName ? (
                                                <Badge variant="outline" className="text-[10px] line-through opacity-50">
                                                    {assignment.oldRouteName}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">None</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Route className="w-3.5 h-3.5 text-orange-500" />
                                                <span className="text-xs font-medium">{assignment.newRouteName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 text-[10px]">
                                                {assignment.newStopCount} stops
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {onEdit && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onEdit(assignment.id)}
                                                        className="h-7 w-7 p-0 hover:bg-blue-100"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onRemove(assignment.id)}
                                                    className="h-7 w-7 p-0 hover:bg-red-100"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </motion.div>
    );
}
