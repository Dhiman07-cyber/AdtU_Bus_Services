"use client";

import { motion } from 'framer-motion';
import {
   Calendar,
   Mail,
   Clock,
   ExternalLink,
   ShieldAlert,
   UserPlus,
   Hourglass,
   Users
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardStats } from './types';
import { useRouter } from 'next/navigation';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { useMemo } from 'react';

interface SystemLifecycleIntelligenceProps {
   stats: DashboardStats;
}

export default function SystemLifecycleIntelligence({ stats }: SystemLifecycleIntelligenceProps) {
   const router = useRouter();
   const { config } = useSystemConfig();

   // Lifecycle Dates from Config or Fallbacks (matching user image)
   const lifecycleDates = useMemo(() => [
      { label: 'Notification', date: config?.renewalReminder || 'June 1st', icon: Mail, color: 'text-blue-400', bg: 'bg-blue-400/10' },
      { label: 'Year End', date: config?.academicYearEnd || 'June 30th', icon: Calendar, color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
      { label: 'Deadline', date: config?.renewalDeadline || 'July 1st', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
      { label: 'Soft Block', date: config?.softBlock || 'July 31st', icon: ShieldAlert, color: 'text-orange-400', bg: 'bg-orange-400/10' },
      { label: 'Hard Delete', date: config?.hardBlock || 'August 31st', icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-400/10', critical: true },
   ], [config]);

   // Derived Analytics
   const reservedCount = stats.activeStudents;
   const expiredCount = stats.expiredStudents;

   return (
      <Card className="relative overflow-hidden bg-slate-900/40 border-slate-700/50 backdrop-blur-2xl shadow-2xl h-full transition-all duration-500 hover:bg-slate-900/60 font-sans">
         <CardContent className="p-4 pt-2 md:p-6 md:pt-2 h-full flex flex-col">
            {/* Header Row */}
            <div className="flex items-center justify-between mb-5">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                     <Hourglass className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="flex flex-col">
                     <h3 className="text-sm font-bold text-white tracking-tight uppercase leading-tight">System Lifecycle Intelligence</h3>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">Academic Compliance Matrix</p>
                  </div>
               </div>
               <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest px-0 h-auto"
                  onClick={() => router.push('/admin/setup-admin')}
               >
                  Edit Config <ExternalLink className="w-3 h-3 ml-1.5" />
               </Button>
            </div>

            {/* Main Intelligence Grid */}
            <div className="flex-1 space-y-8">
               {/* Section 1: Lifecycle Timeline */}
               <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                     <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Active Cycle Milestones</span>
                  </div>

                  <div className="relative flex justify-between items-start pt-2">
                     {/* Connecting Line */}
                     <div className="absolute top-6 left-5 right-5 h-[2px] bg-slate-800/50 z-0" />

                     {lifecycleDates.map((milestone, idx) => (
                        <motion.div
                           key={milestone.label}
                           initial={{ opacity: 0, y: 10 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ delay: idx * 0.1 }}
                           className="relative z-10 flex flex-col items-center gap-2 group cursor-default"
                        >
                           <div className={`w-8 h-8 rounded-full ${milestone.bg} border-2 ${milestone.critical ? 'border-red-500/30' : 'border-slate-800 group-hover:border-indigo-500/40'} flex items-center justify-center transition-all`}>
                              <milestone.icon className={`w-3.5 h-3.5 ${milestone.color}`} />
                           </div>
                           <div className="flex flex-col items-center text-center">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-0.5">{milestone.label}</span>
                              <span className="text-[10px] font-bold text-white whitespace-nowrap">{milestone.date}</span>
                           </div>
                        </motion.div>
                     ))}
                  </div>
               </div>

               {/* Section 2: Reservation Analytics */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-3xl bg-emerald-500/[0.03] border border-emerald-500/10 flex flex-col gap-3 group hover:border-emerald-500/30 transition-all">
                     <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                           <UserPlus className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[8px] font-black uppercase">RESERVED</div>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-3xl font-black text-white">{reservedCount}</span>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Confirmed Seats</span>
                     </div>
                  </div>

                  <div className="p-5 rounded-3xl bg-red-500/[0.03] border border-red-500/10 flex flex-col gap-3 group hover:border-red-500/30 transition-all">
                     <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
                           <ShieldAlert className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="px-2 py-0.5 bg-red-500/20 text-red-500 rounded-full text-[8px] font-black uppercase">RENEWAL RISK</div>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-3xl font-black text-white">{expiredCount}</span>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Status: Expired</span>
                     </div>
                  </div>
               </div>
            </div>
         </CardContent>
      </Card>
   );
}


