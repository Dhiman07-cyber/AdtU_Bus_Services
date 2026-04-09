"use client";

import { motion } from 'framer-motion';
import {
  Users,
  Bus,
  Route as RouteIcon,
  FileCheck,
  DollarSign,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  UserCheck,
  IndianRupee
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardStats } from './types';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

// Mini sparkline data simulation
const generateSparklineData = (base: number) => {
  return Array.from({ length: 10 }, (_, i) => ({
    value: base + Math.random() * (base * 0.2) - (base * 0.1)
  }));
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: any;
  trend?: string;
  trendColor?: 'emerald' | 'blue' | 'amber';
  color: string;
  className?: string;
  sparklineBase?: number;
}

const MetricCard = ({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
  trendColor = 'emerald',
  color,
  className,
  sparklineBase
}: MetricCardProps) => {
  const data = sparklineBase ? generateSparklineData(sparklineBase) : [];

  return (
    <Card className={cn(
      "relative overflow-hidden group border-slate-800 bg-slate-900/40 backdrop-blur-xl hover:bg-slate-900/60 transition-all duration-500",
      className
    )}>
      <CardContent className="p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
        <div className="flex flex-col items-center mb-2">
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-105 duration-500",
            color
          )}>
            <Icon className="w-4 h-4" />
          </div>
        </div>

        <div className="space-y-0.5 w-full">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">{title}</h3>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-white tracking-tight">{value}</span>
            {subValue && <span className="text-[10px] font-semibold text-slate-500">{subValue}</span>}
          </div>
        </div>

      </CardContent>
    </Card>
  );
};

export default function KeyMetricsGrid({ stats, role = 'admin' }: { stats: DashboardStats, role?: 'admin' | 'moderator' }) {
  const router = useRouter();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-9 gap-3 mb-8">
      {/* Primary Revenue/Payment Card - Spans 5/9 columns (~55%) and 2 rows on large screens */}
      <Card className="md:col-span-2 lg:col-span-5 lg:row-span-2 relative overflow-hidden group border-slate-700/50 bg-slate-900/40 backdrop-blur-2xl hover:bg-slate-900/60 shadow-2xl transition-all duration-500">
        <div className="absolute top-16 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          {role === 'admin' ? (
            <IndianRupee className="w-32 h-32 text-indigo-500" />
          ) : (
            <FileCheck className="w-32 h-32 text-emerald-500" />
          )}
        </div>

        <CardContent className="p-2.5 md:p-3 px-5 md:px-6 pb-1.5 flex flex-col justify-between h-full relative z-10">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  {role === 'admin' ? 'Real-time Revenue' : 'Payment Processing'}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white group/btn"
                onClick={() => router.push(role === 'admin' ? '/admin/renewal-service' : '/moderator/renewal-service')}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest mr-2">Audit Log</span>
                <ArrowUpRight className="w-4 h-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
              </Button>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                {role === 'admin' ? 'Total Cumulative Revenue' : 'Online vs Offline Preference'}
              </h3>
              <div className="flex items-baseline gap-4">
                {role === 'admin' ? (
                  <span className="text-3xl md:text-4xl font-black text-white tracking-tighter">
                    {stats.totalRevenue ? stats.totalRevenue.toLocaleString('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 0
                    }) : '₹0'}
                  </span>
                ) : (
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-3xl font-black text-indigo-400">{stats.onlinePayments || 0}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Online</span>
                    </div>
                    <div className="h-10 w-px bg-white/10 mx-2" />
                    <div className="flex flex-col">
                      <span className="text-3xl font-black text-emerald-400">{stats.offlinePayments || 0}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Offline</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4 pt-3 border-t border-white/5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Bus fee</span>
              <div className="text-xl font-bold text-white">₹{typeof stats.systemBusFee === 'number' ? stats.systemBusFee.toLocaleString('en-IN') : '...'}</div>
            </div>
            {role === 'admin' ? (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Online Payments</span>
                  <div className="text-xl font-bold text-indigo-400">{stats.onlinePayments || 0}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Offline Payments</span>
                  <div className="text-xl font-bold text-emerald-400">{stats.offlinePayments || 0}</div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Currency</span>
                  <div className="text-xl font-bold text-cyan-400">INR</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Gateway</span>
                  <div className="text-xl font-bold text-orange-400">Razorpay</div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Medium Count Cards */}
      <MetricCard
        title="Active Students"
        value={stats.activeStudents}
        subValue={`out of ${stats.totalStudents}`}
        icon={Users}
        color="bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-600/20"
        className="lg:col-span-2"
      />

      <MetricCard
        title="Active Buses"
        value={stats.activeBuses}
        subValue={`out of ${stats.totalBuses}`}
        icon={Bus}
        color="bg-gradient-to-br from-cyan-600 to-blue-600 shadow-cyan-600/20"
        className="lg:col-span-2"
      />

      <MetricCard
        title="Active Student Applications"
        value={stats.pendingApplications}
        subValue="Remaining"
        icon={FileCheck}
        color="bg-gradient-to-br from-amber-600 to-orange-600 shadow-amber-600/20"
        className="lg:col-span-2"
      />

      <MetricCard
        title="Active Driver"
        value={stats.totalDrivers}
        subValue="Operational"
        icon={UserCheck}
        color="bg-gradient-to-br from-indigo-600 to-purple-600 shadow-indigo-600/20"
        className="lg:col-span-2"
      />
    </div>
  );
}
