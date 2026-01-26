"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  GraduationCap,
  UserCog,
  Bus,
  MapPin,
  ClipboardCheck,
  Bell,
  MessageCircle,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  Sparkles,
  QrCode,
  UserPlus,
  RotateCcw,
  ArrowRightLeft,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebar } from './AppShell';
import { useSystemConfig } from '@/contexts/SystemConfigContext';

interface SidebarItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  color?: string;
}

interface NavGroup {
  name: string;
  items: SidebarItem[];
}

const moderatorNavGroups: NavGroup[] = [
  {
    name: 'CORE',
    items: [
      { href: '/moderator', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-400' },
    ]
  },
  {
    name: 'STUDENT',
    items: [
      { href: '/moderator/students', label: 'Student Management', icon: Users, color: 'text-blue-400' },
      { href: '/moderator/students/add', label: 'Add Student', icon: UserPlus, color: 'text-emerald-400' },
      { href: '/moderator/smart-allocation', label: 'Reassignment', icon: ArrowRightLeft, color: 'text-indigo-400' },
      { href: '/moderator/renewal-service', label: 'Renewal', icon: RotateCcw, color: 'text-amber-400' },
      { href: '/moderator/applications', label: 'Applications', icon: ClipboardCheck, color: 'text-orange-400' },
      { href: '/moderator/verification', label: 'Verification', icon: QrCode, color: 'text-cyan-400' },
    ]
  },
  {
    name: 'DRIVER',
    items: [
      { href: '/moderator/drivers', label: 'Driver Management', icon: Users, color: 'text-indigo-400' },
      { href: '/moderator/drivers/add', label: 'Add Driver', icon: UserPlus, color: 'text-emerald-400' },
      { href: '/moderator/driver-assignment', label: 'Reassignment', icon: ArrowRightLeft, color: 'text-purple-400' },
    ]
  },
  {
    name: 'LOGISTICS',
    items: [
      { href: '/moderator/buses', label: 'Buses', icon: Bus, color: 'text-amber-400' },
      { href: '/moderator/routes', label: 'Routes', icon: MapPin, color: 'text-emerald-400' },
    ]
  },
  {
    name: 'SUPPORT',
    items: [
      { href: '/moderator/notifications', label: 'Notifications', icon: Bell, color: 'text-red-400' },
      { href: '/moderator/feedback', label: 'Feedbacks', icon: MessageCircle, color: 'text-cyan-400' },
    ]
  }
];

export default function ModeratorSidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen } = useSidebar();
  const { config } = useSystemConfig();

  // Auto-collapse on mobile (to keep desktop view compact if resized)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setCollapsed]);

  return (
    <aside
      style={{
        width: collapsed ? 64 : 220,
        willChange: 'width',
        contain: 'layout style paint',
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden'
      }}
      className={cn(
        "fixed top-12 left-0 bottom-0 z-40",
        "border-r border-white/10",
        "bg-[#0B1224]",
        "flex flex-col overflow-hidden",
        "hidden md:flex",
        "transition-[width] duration-100 ease-linear"
      )}
    >

      {/* Header/Toggle Section */}
      <div className={cn(
        "flex items-center px-3 py-2 h-14 shrink-0",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="relative group">
              <div className="absolute inset-0 bg-purple-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] font-bold text-zinc-100 leading-none tracking-tight">
                Operations
              </span>
              <span className="text-[10px] text-zinc-500 font-medium">Moderator Hub</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-6 w-6 rounded-md hover:bg-white/5 transition-all text-zinc-500 hover:text-zinc-200"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Navigation Groups */}
      <nav className={cn(
        "flex-1 px-2 overflow-y-auto no-scrollbar pb-10",
        collapsed ? "space-y-2" : "space-y-4"
      )}
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, black 16px, black 96%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 16px, black 96%, transparent)'
        }}
      >
        {moderatorNavGroups.map((group, groupIdx) => (
          <div key={group.name} className={cn(
            collapsed ? "mt-2 space-y-0" : "mt-2 space-y-0.5"
          )}>
            {!collapsed && (
              <h3 className="px-2 text-[9px] uppercase tracking-widest font-semibold text-zinc-600 font-mono">
                {group.name}
              </h3>
            )}
            <div className={cn(
              collapsed ? "space-y-4" : "space-y-0.5"
            )}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/moderator' && pathname?.startsWith(item.href));

                return (
                  <Tooltip key={`${item.href}-${collapsed ? 'collapsed' : 'expanded'}`}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-2.5 px-2.5 rounded-md transition-colors duration-150",
                          collapsed ? "py-2" : "py-1.5",
                          "text-[12.5px] font-medium outline-none",
                          isActive
                            ? "text-blue-400 bg-blue-400/5"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTabModerator"
                            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-blue-500 rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                        )}

                        <div className={cn(
                          "relative flex items-center justify-center",
                          collapsed ? "mx-auto" : ""
                        )}>
                          <Icon className={cn("h-4 w-4", isActive ? "text-blue-400" : item.color)} />
                          {isActive && (
                            <div className="absolute inset-0 bg-blue-400/20 blur-[6px] rounded-full" />
                          )}
                        </div>

                        {!collapsed && (
                          <span className="truncate relative">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent
                        side="right"
                        sideOffset={10}
                        className="bg-slate-900/90 backdrop-blur-md border border-slate-700/50 text-slate-100 text-xs font-medium px-3 py-2 rounded-lg shadow-xl"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-3.5 w-3.5", item.color)} />
                          <span>{item.label}</span>
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Role Status Footer */}
      <div className="mt-auto flex flex-col gap-1 px-2 pb-3">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-1" />
        {!collapsed ? (
          <div className="mt-1 px-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">Active</span>
            </div>
            <span className="text-[9px] text-zinc-700 font-mono tracking-tighter">Moderator</span>
          </div>
        ) : (
          <div className="flex justify-center mt-1 opacity-60">
            <span className="text-[8px] text-zinc-600 font-mono tracking-tighter">
              {config?.version || 'v2.4.0'}
            </span>
          </div>
        )}
      </div>

    </aside>
  );
}
