"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  GraduationCap,
  UserCog,
  ShieldCheck,
  Bus,
  MapPin,
  ClipboardCheck,
  Bell,
  MessageCircle,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  Command,
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
import { useTheme } from '@/components/theme-provider';

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

const adminNavGroups: NavGroup[] = [
  {
    name: 'CORE',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-400' },
    ]
  },
  {
    name: 'STUDENT',
    items: [
      { href: '/admin/students', label: 'Student Management', icon: Users, color: 'text-blue-400' },
      { href: '/admin/students/add', label: 'Add Student', icon: UserPlus, color: 'text-emerald-400' },
      { href: '/admin/smart-allocation', label: 'Reassignment', icon: ArrowRightLeft, color: 'text-indigo-400' },
      { href: '/admin/renewal-service', label: 'Renewal', icon: RotateCcw, color: 'text-amber-400' },
      { href: '/admin/applications', label: 'Applications', icon: ClipboardCheck, color: 'text-orange-400' },
      { href: '/admin/verification', label: 'Verification', icon: QrCode, color: 'text-cyan-400' },
    ]
  },
  {
    name: 'DRIVER',
    items: [
      { href: '/admin/drivers', label: 'Driver Management', icon: Users, color: 'text-indigo-400' },
      { href: '/admin/drivers/add', label: 'Add Driver', icon: UserPlus, color: 'text-emerald-400' },
      { href: '/admin/driver-assignment', label: 'Reassignment', icon: ArrowRightLeft, color: 'text-purple-400' },
    ]
  },
  {
    name: 'TEAM',
    items: [
      { href: '/admin/moderators', label: 'Moderators', icon: ShieldCheck, color: 'text-pink-400' },
    ]
  },
  {
    name: 'LOGISTICS',
    items: [
      { href: '/admin/buses', label: 'Buses', icon: Bus, color: 'text-amber-400' },
      { href: '/admin/routes', label: 'Routes', icon: MapPin, color: 'text-emerald-400' },
    ]
  },
  {
    name: 'SUPPORT',
    items: [
      { href: '/admin/notifications', label: 'Notifications', icon: Bell, color: 'text-red-400' },
      { href: '/admin/feedback', label: 'Feedbacks', icon: MessageCircle, color: 'text-cyan-400' },
    ]
  }
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen } = useSidebar();
  const { config } = useSystemConfig();
  const { theme } = useTheme();

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
        "border-r",
        theme === 'dark' ? "border-white/10 bg-[#0B1224]" : "border-admin-border bg-admin-sidebar",
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
              <div className="absolute inset-0 bg-blue-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20">
                <Command className="h-3.5 w-3.5 text-blue-400" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className={cn("text-[12px] font-bold leading-none tracking-tight", theme === 'dark' ? "text-zinc-100" : "text-admin-text")}>
                Control Hub
              </span>
              <span className={cn("text-[10px] font-medium", theme === 'dark' ? "text-zinc-400" : "text-admin-text-secondary")}>Administrator</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn("h-6 w-6 rounded-md transition-all", theme === 'dark' ? "hover:bg-white/5 text-zinc-500 hover:text-zinc-200" : "hover:bg-admin-hover text-admin-text-secondary hover:text-admin-text")}
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
        {adminNavGroups.map((group, groupIdx) => (
          <div key={group.name} className={cn(
            collapsed ? "mt-2 space-y-0" : "mt-2 space-y-0.5"
          )}>
            {!collapsed && (
              <h3 className={cn("px-2 text-[9px] uppercase tracking-widest font-semibold mb-1 font-mono", theme === 'dark' ? "text-zinc-400" : "text-admin-text-secondary")}>
                {group.name}
              </h3>
            )}
            <div className={cn(
              collapsed ? "space-y-4" : "space-y-0.5"
            )}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const allHrefs = adminNavGroups.flatMap(group => group.items.map(i => i.href));
                const isActive = pathname === item.href || (
                  item.href !== '/admin' &&
                  pathname?.startsWith(item.href) &&
                  !allHrefs.some(h => h !== item.href && h.startsWith(item.href) && pathname?.startsWith(h))
                );

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
                            ? theme === 'dark' ? "text-blue-400 bg-blue-400/5" : "text-admin-primary bg-admin-active"
                            : theme === 'dark' ? "text-zinc-400 hover:text-zinc-100 hover:bg-white/5" : "text-admin-text-secondary hover:text-admin-text hover:bg-admin-hover"
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTab"
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
                        className={cn("backdrop-blur-md border text-xs font-medium px-3 py-2 rounded-lg shadow-xl", theme === 'dark' ? "bg-slate-900/90 border-slate-700/50 text-slate-100" : "bg-admin-card border-admin-border text-admin-text")}
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

      {/* System & Footer Section (Pinned to Bottom) */}
      <div className="mt-auto flex flex-col gap-1 px-2 pb-3">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-1" />
        <Tooltip key={`sys-config-${collapsed ? 'collapsed' : 'expanded'}`}>
          <TooltipTrigger asChild>
            <Link
              href="/admin/sys-renewal-config-x9k2p"
              className={cn(
                "group relative flex items-center gap-2.5 px-2.5 rounded-lg transition-all duration-300",
                collapsed ? "py-2" : "py-2",
                "text-[12.5px] font-medium outline-none",
                pathname?.includes('sys-renewal-config')
                  ? theme === 'dark' ? "text-white bg-white/5" : "text-admin-text bg-admin-active"
                  : theme === 'dark' ? "text-zinc-400 hover:text-zinc-100 hover:bg-white/5" : "text-admin-text-secondary hover:text-admin-text hover:bg-admin-hover"
              )}
            >
              <div className={cn(
                "relative flex items-center justify-center transition-transform duration-300 group-hover:rotate-90",
                collapsed ? "mx-auto" : ""
              )}>
                <Settings className={cn("h-4 w-4 transition-colors", theme === 'dark' ? "text-zinc-400 group-hover:text-white" : "text-admin-text-secondary group-hover:text-admin-text")} />
              </div>

              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-start leading-none"
                >
                  <span className={cn(theme === 'dark' ? "text-zinc-200" : "text-admin-text")}>System Config</span>
                  <span className={cn("text-[9px] mt-0.5", theme === 'dark' ? "text-zinc-400" : "text-admin-text-secondary")}>Core Settings</span>
                </motion.div>
              )}
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent
              side="right"
              sideOffset={10}
              className={cn("backdrop-blur-md border text-xs font-medium px-3 py-2 rounded-lg shadow-xl", theme === 'dark' ? "bg-slate-900/90 border-slate-700/50 text-slate-100" : "bg-white border-[#E5E7EB] text-[#111827]")}
            >
              <div className="flex items-center gap-2">
                <Settings className={cn("h-3.5 w-3.5", theme === 'dark' ? "text-zinc-400" : "text-[#6B7280]")} />
                <span>System Config</span>
              </div>
            </TooltipContent>
          )}
        </Tooltip>

        {/* Active Status Footer */}
        {!collapsed ? (
          <div className="mt-1 px-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
              <span className={cn("text-[9px] uppercase tracking-wider font-semibold", theme === 'dark' ? "text-zinc-400" : "text-admin-text-secondary")}>Active</span>
            </div>
            <span className={cn("text-[9px] font-mono", theme === 'dark' ? "text-zinc-400" : "text-admin-text-secondary")}>{config?.version || 'v2.4.0'}</span>
          </div>
        ) : (
          <div className="flex justify-center mt-1 opacity-60">
            <span className={cn("text-[8px] font-mono tracking-tighter", theme === 'dark' ? "text-zinc-400" : "text-admin-text-secondary")}>
              {config?.version || 'v2.4.0'}
            </span>
          </div>
        )}
      </div>

    </aside>
  );
}
