"use client";

import { motion } from 'framer-motion';
import {
  Zap,
  Bus,
  Users,
  Activity,
  FileCheck,
  DollarSign,
  TrendingUp,
  Clock,
  MessageSquare as MessageSquareIcon
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DashboardStats } from './types';
import { cn } from '@/lib/utils';

interface HealthMetricProps {
  icon: any;
  label: string;
  value: string | number;
  subValue?: string;
  color: 'blue' | 'emerald' | 'amber' | 'purple' | 'red' | 'indigo' | 'cyan';
  delay: number;
}

const HealthMetric = ({ icon: Icon, label, value, subValue, color, delay }: HealthMetricProps) => {
  const colorVariants: Record<string, string> = {
    blue: 'bg-blue-500/5 border-blue-500/10 text-blue-400',
    emerald: 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/5 border-amber-500/10 text-amber-400',
    purple: 'bg-purple-500/5 border-purple-500/10 text-purple-400',
    red: 'bg-red-500/5 border-red-500/10 text-red-400',
    indigo: 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400',
    cyan: 'bg-cyan-500/5 border-cyan-500/10 text-cyan-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1 }}
      className={cn(
        "flex-1 flex flex-col items-center justify-center text-center gap-1.5 p-2 rounded-xl border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:bg-white/5",
        colorVariants[color]
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-500",
        `bg-${color}-500/10 shadow-${color}-400/5`
      )}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400/80 mb-0.5">
          {label}
        </span>
        <div className="flex flex-col items-center">
          <span className="text-base font-black tracking-tight text-white leading-none">
            {value}
          </span>
          {subValue && (
            <span className="text-[8px] font-bold text-slate-400 mt-0.5 tracking-wide uppercase opacity-70">
              {subValue}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default function SystemHealthStrip({ stats }: { stats: DashboardStats }) {
  const activeTripsCount = stats.enrouteBuses || stats.activeBuses || 0;
  const idleBusesCount = Math.max(0, (stats.operationalBuses || stats.totalBuses) - activeTripsCount);
  const router = useRouter();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-0 w-full animate-in fade-in slide-in-from-bottom-4 duration-1000 mb-5">
      <HealthMetric
        icon={Zap}
        label="Active Trips"
        value={activeTripsCount}
        subValue="in motion"
        color="blue"
        delay={0}
      />
      <HealthMetric
        icon={Bus}
        label="Idle Buses"
        value={idleBusesCount}
        subValue="at stand"
        color="indigo"
        delay={1}
      />
      <HealthMetric
        icon={Users}
        label="Drivers Ready"
        value={stats.totalDrivers}
        subValue="available"
        color="purple"
        delay={2}
      />
      <div onClick={() => router.push('/admin/feedback')} className="cursor-pointer">
        <HealthMetric
          icon={MessageSquareIcon}
          label="Feedbacks Received"
          value={stats.feedbacksCount}
          subValue="Last 7 days"
          color="cyan"
          delay={3}
        />
      </div>
    </div>
  );
}
