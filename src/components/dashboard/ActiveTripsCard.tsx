"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Bus, MapPin, User, Clock, Users } from 'lucide-react';

interface Trip {
    id: string;
    busId: string; // e.g., "Bus-6 (AS-01-...)"
    routeName: string;
    driverName: string;
    driverId: string;
    startTime: string; // ISO string
    studentCount: number;
    status: string;
}

interface ActiveTripsCardProps {
    trips: Trip[];
    className?: string; // Allow external styling (sizing/grid placement)
}

export function ActiveTripsCard({ trips, className }: ActiveTripsCardProps) {
    return (
        <Card className={`bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-500/30 transition-all duration-300 group flex flex-col py-0 gap-0 overflow-hidden cursor-pointer ${className}`}>
            <CardHeader className="px-3 py-2 border-b border-gray-200 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/20 pb-2 mb-0 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-green-500/10 ring-1 ring-green-500/20 group-hover:bg-green-500/20 group-hover:ring-green-500/40 transition-all">
                            <Activity className="h-3.5 w-3.5 text-green-500 group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                            <CardTitle className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-green-500 transition-colors pt-2.5">
                                Active Trips
                            </CardTitle>
                            <CardDescription className="text-[9px] text-gray-500 leading-tight">
                                Real-time operational overview
                            </CardDescription>
                        </div>
                    </div>
                    {trips.length > 0 && (
                        <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/5 text-[9px] px-1.5 py-0 h-4">
                            {trips.length} Active
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 min-h-0 bg-transparent">
                <ScrollArea className="h-[250px] w-full px-0">
                    {trips.length > 0 ? (
                        <div className="space-y-0.5 pb-2 pt-0.5">
                            {trips.map((trip) => (
                                <div
                                    key={trip.id}
                                    className="group/item relative overflow-hidden border-b border-gray-800/50 bg-gray-900/20 p-2.5 hover:bg-gray-900/60 transition-all duration-300 last:border-0"
                                >
                                    {/* Visual Accent */}
                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-green-500 to-green-600 opacity-0 group-hover/item:opacity-100 transition-opacity" />

                                    <div className="flex items-start justify-between gap-2 px-1">
                                        {/* Left: Bus & Route Info */}
                                        <div className="space-y-1.5 flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                                                    <Bus className="h-3.5 w-3.5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <h4 className="text-xs font-bold text-gray-200 group-hover/item:text-white truncate">
                                                            {trip.busId}
                                                        </h4>
                                                        <span className="text-[10px] text-gray-600 font-thin hidden sm:inline">|</span>
                                                        <div className="flex items-center gap-0.5 text-[10px] text-gray-400 truncate">
                                                            <MapPin className="h-2.5 w-2.5 text-gray-500" />
                                                            <span className="truncate">{trip.routeName}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 mt-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                                            <User className="h-3 w-3 text-purple-400" />
                                                            <span className="truncate max-w-[100px]">
                                                                {trip.driverName && trip.driverName !== 'Unknown' ? trip.driverName : 'No Driver'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                                            <Users className="h-3 w-3 text-orange-400" />
                                                            <span>{trip.studentCount} students</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Status & Time */}
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <Badge className="bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 shadow-[0_0_8px_-3px_rgba(34,197,94,0.3)] backdrop-blur-sm transition-all text-[9px] px-1.5 py-0 h-4 flex items-center gap-1">
                                                <span className="relative flex h-1.5 w-1.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                                </span>
                                                {trip.status}
                                            </Badge>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                                                <Clock className="h-3 w-3" />
                                                <span>{new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-4 space-y-2 min-h-[150px]">
                            <div className="h-8 w-8 rounded-full bg-gray-800/50 flex items-center justify-center">
                                <Activity className="h-4 w-4 text-gray-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-gray-400">No Active Trips</p>
                                <p className="text-[9px] text-gray-600 max-w-[120px] mx-auto">
                                    Buses are currently idle.
                                </p>
                            </div>
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
