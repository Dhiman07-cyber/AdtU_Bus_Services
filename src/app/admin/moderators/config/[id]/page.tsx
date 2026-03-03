"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import {
    ModeratorPermissions,
    DEFAULT_MODERATOR_PERMISSIONS,
    FULL_MODERATOR_PERMISSIONS,
    PERMISSION_CATEGORIES,
} from "@/lib/types/moderator-permissions";
import {
    ArrowLeft,
    Shield,
    ShieldCheck,
    ShieldOff,
    Save,
    RotateCcw,
    Users,
    UserCog,
    Bus,
    MapPin,
    ClipboardCheck,
    CreditCard,
    Loader2,
    Check,
    X,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Info,
    Sparkles,
    Lock,
    Unlock,
    Eye,
    Plus,
    Pencil,
    Trash2,
    ArrowRightLeft,
    CheckCircle2,
    XCircle,
    QrCode,
    UserCheck,
    Wallet,
} from "lucide-react";

// ═══════════════════════════════════════════════
// ICON MAP
// ═══════════════════════════════════════════════
const categoryIcons: Record<string, any> = {
    Users,
    UserCog,
    Bus,
    MapPin,
    ClipboardCheck,
    CreditCard,
};

const permissionIcons: Record<string, any> = {
    canView: Eye,
    canAdd: Plus,
    canEdit: Pencil,
    canDelete: Trash2,
    canReassign: ArrowRightLeft,
    canApprove: CheckCircle2,
    canReject: XCircle,
    canGenerateVerificationCode: QrCode,
    canAppearInModeratorList: UserCheck,
    canApproveOfflinePayment: Wallet,
    canRejectOfflinePayment: XCircle,
};

// ═══════════════════════════════════════════════
// COLOR MAP
// ═══════════════════════════════════════════════
const colorMap: Record<string, { bg: string; border: string; text: string; accent: string; ring: string }> = {
    blue: {
        bg: "bg-blue-500/5",
        border: "border-blue-500/20",
        text: "text-blue-400",
        accent: "bg-blue-500/10",
        ring: "ring-blue-500/30",
    },
    indigo: {
        bg: "bg-indigo-500/5",
        border: "border-indigo-500/20",
        text: "text-indigo-400",
        accent: "bg-indigo-500/10",
        ring: "ring-indigo-500/30",
    },
    amber: {
        bg: "bg-amber-500/5",
        border: "border-amber-500/20",
        text: "text-amber-400",
        accent: "bg-amber-500/10",
        ring: "ring-amber-500/30",
    },
    emerald: {
        bg: "bg-emerald-500/5",
        border: "border-emerald-500/20",
        text: "text-emerald-400",
        accent: "bg-emerald-500/10",
        ring: "ring-emerald-500/30",
    },
    orange: {
        bg: "bg-orange-500/5",
        border: "border-orange-500/20",
        text: "text-orange-400",
        accent: "bg-orange-500/10",
        ring: "ring-orange-500/30",
    },
    purple: {
        bg: "bg-purple-500/5",
        border: "border-purple-500/20",
        text: "text-purple-400",
        accent: "bg-purple-500/10",
        ring: "ring-purple-500/30",
    },
};

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
export default function ModConfigPage() {
    const params = useParams();
    const router = useRouter();
    const { userData } = useAuth();
    const { addToast } = useToast();
    const modId = params.id as string;

    // State
    const [moderator, setModerator] = useState<any>(null);
    const [permissions, setPermissions] = useState<ModeratorPermissions>(DEFAULT_MODERATOR_PERMISSIONS);
    const [originalPermissions, setOriginalPermissions] = useState<ModeratorPermissions>(DEFAULT_MODERATOR_PERMISSIONS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(Object.keys(PERMISSION_CATEGORIES))
    );

    // ═══════════════════════════════════════════════
    // FETCH MOD INFO + PERMISSIONS
    // ═══════════════════════════════════════════════
    const fetchPermissions = useCallback(async () => {
        if (!modId) return;

        try {
            setLoading(true);
            const token = await auth.currentUser?.getIdToken();
            if (!token) {
                addToast("Authentication required", "error");
                router.push("/admin/moderators");
                return;
            }

            const res = await fetch(`/api/moderators/${modId}/permissions`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to fetch permissions");
            }

            const data = await res.json();
            setModerator(data.moderator);

            if (data.permissions) {
                // Merge with defaults for backward compatibility
                const merged = mergeWithDefaults(data.permissions);
                setPermissions(merged);
                setOriginalPermissions(merged);
            } else {
                setPermissions(DEFAULT_MODERATOR_PERMISSIONS);
                setOriginalPermissions(DEFAULT_MODERATOR_PERMISSIONS);
            }
        } catch (error: any) {
            console.error("Error fetching moderator permissions:", error);
            addToast(error.message || "Failed to load moderator permissions", "error");
        } finally {
            setLoading(false);
        }
    }, [modId, router, addToast]);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    // Track changes
    useEffect(() => {
        setHasChanges(JSON.stringify(permissions) !== JSON.stringify(originalPermissions));
    }, [permissions, originalPermissions]);

    // ═══════════════════════════════════════════════
    // SAVE PERMISSIONS
    // ═══════════════════════════════════════════════
    const savePermissions = async () => {
        try {
            setSaving(true);
            const token = await auth.currentUser?.getIdToken();
            if (!token) {
                addToast("Authentication required", "error");
                return;
            }

            const res = await fetch(`/api/moderators/${modId}/permissions`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ permissions }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save permissions");
            }

            setOriginalPermissions(permissions);
            addToast("Permissions saved successfully!", "success");
        } catch (error: any) {
            console.error("Error saving permissions:", error);
            addToast(error.message || "Failed to save permissions", "error");
        } finally {
            setSaving(false);
        }
    };

    // ═══════════════════════════════════════════════
    // TOGGLE HELPERS
    // ═══════════════════════════════════════════════
    const togglePermission = (category: string, key: string) => {
        setPermissions((prev) => ({
            ...prev,
            [category]: {
                ...prev[category as keyof ModeratorPermissions],
                [key]: !(prev[category as keyof ModeratorPermissions] as any)[key],
            },
        }));
    };

    const toggleCategory = (category: string, enableAll: boolean) => {
        const categoryPerms = PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES];
        if (!categoryPerms) return;

        const updatedPerms: Record<string, boolean> = {};
        for (const key of Object.keys(categoryPerms.permissions)) {
            updatedPerms[key] = enableAll;
        }

        setPermissions((prev) => ({
            ...prev,
            [category]: updatedPerms,
        }));
    };

    const applyPreset = (preset: "default" | "full") => {
        if (preset === "default") {
            setPermissions(DEFAULT_MODERATOR_PERMISSIONS);
        } else {
            setPermissions(FULL_MODERATOR_PERMISSIONS);
        }
    };

    const resetChanges = () => {
        setPermissions(originalPermissions);
    };

    const toggleCategoryExpand = (category: string) => {
        setExpandedCategories((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(category)) {
                newSet.delete(category);
            } else {
                newSet.add(category);
            }
            return newSet;
        });
    };

    // Count permissions
    const countPermissions = (perms: ModeratorPermissions) => {
        let total = 0;
        let enabled = 0;
        for (const category of Object.values(perms)) {
            for (const value of Object.values(category)) {
                total++;
                if (value) enabled++;
            }
        }
        return { total, enabled };
    };

    const { total, enabled } = countPermissions(permissions);

    // ═══════════════════════════════════════════════
    // LOADING STATE
    // ═══════════════════════════════════════════════
    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="relative">
                        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                        <Shield className="w-5 h-5 text-blue-400/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-slate-400 text-sm">Loading Permissions...</p>
                </motion.div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════
    return (
        <div className="mt-10 py-4">
            {/* ── HEADER ── */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push("/admin/moderators")}
                            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-blue-400" />
                                <h1 className="text-xl font-bold tracking-tight text-white mb-0.5">Moderator Configuration</h1>
                            </div>
                            {moderator && (
                                <p className="text-sm text-slate-400 font-medium">
                                    {moderator.name} <span className="text-slate-600 mx-1">•</span> {moderator.email}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Permission counter badge */}
                        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 shadow-sm">
                            <div className={`w-2.5 h-2.5 rounded-full ${enabled === total ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : enabled > 0 ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]"}`} />
                            <span className="text-sm text-slate-200 font-semibold tracking-wide">
                                <span className={enabled === total ? "text-emerald-400" : enabled > 0 ? "text-amber-400" : "text-red-400"}>{enabled}</span>
                                <span className="text-slate-500 mx-0.5">/</span>
                                {total}
                                <span className="text-slate-500 ml-1.5 font-normal">Active</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── MAIN CONTENT ── */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-[#0a0a0f] rounded-2xl border border-white/5 p-4 sm:p-8 space-y-6">
                    {/* ── MODERATOR INFO CARD ── */}
                    {moderator && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl bg-white/[0.02] border border-white/5 p-5"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                                    <span className="text-lg font-bold text-white">
                                        {(moderator.name || "?")[0].toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-white font-semibold truncate">{moderator.name}</h2>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                        <span>{moderator.email}</span>
                                        {moderator.employeeId && (
                                            <>
                                                <span>•</span>
                                                <span>ID: {moderator.employeeId}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${moderator.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                    }`}>
                                    {moderator.status}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── PRESET BUTTONS ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="flex flex-wrap items-center gap-3"
                    >
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Presets:</span>
                        <button
                            onClick={() => applyPreset("default")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-sm text-slate-300 transition-all"
                        >
                            <ShieldOff className="w-3.5 h-3.5 text-slate-400" />
                            View Only
                        </button>
                        <button
                            onClick={() => applyPreset("full")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-sm text-slate-300 transition-all"
                        >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Full Access
                        </button>

                        {hasChanges && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-1.5 ml-auto"
                            >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-xs text-amber-400">Unsaved changes</span>
                            </motion.div>
                        )}
                    </motion.div>

                    {/* ── PERMISSION CATEGORIES ── */}
                    <div className="space-y-4">
                        {Object.entries(PERMISSION_CATEGORIES).map(([categoryKey, category], index) => {
                            const isExpanded = expandedCategories.has(categoryKey);
                            const Icon = categoryIcons[category.icon] || Shield;
                            const colors = colorMap[category.color] || colorMap.blue;
                            const categoryPermissions = permissions[categoryKey as keyof ModeratorPermissions] as Record<string, boolean>;
                            const permEntries = Object.entries(category.permissions);
                            const enabledCount = permEntries.filter(([key]) => categoryPermissions[key]).length;
                            const totalCount = permEntries.length;
                            const allEnabled = enabledCount === totalCount;
                            const noneEnabled = enabledCount === 0;

                            return (
                                <motion.div
                                    key={categoryKey}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 * (index + 2) }}
                                    className={`rounded-xl border ${colors.border} overflow-hidden transition-all`}
                                >
                                    {/* Category Header */}
                                    <button
                                        onClick={() => toggleCategoryExpand(categoryKey)}
                                        className={`w-full flex items-center justify-between p-4 ${colors.bg} hover:bg-white/[0.03] transition-colors`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-lg ${colors.accent} flex items-center justify-center`}>
                                                <Icon className={`w-4.5 h-4.5 ${colors.text}`} />
                                            </div>
                                            <div className="text-left">
                                                <h3 className="text-sm font-semibold text-white">{category.label}</h3>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {enabledCount}/{totalCount} permissions enabled
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* Premium Toggle All Button */}
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleCategory(categoryKey, !allEnabled);
                                                }}
                                                className={`relative w-[46px] h-[24px] rounded-full cursor-pointer transition-all duration-300 flex items-center shadow-inner ${allEnabled
                                                    ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                                                    : noneEnabled
                                                        ? "bg-slate-800/80 border border-slate-700/50"
                                                        : "bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                                                    }`}
                                            >
                                                <motion.div
                                                    layout
                                                    transition={{ type: "spring", stiffness: 700, damping: 30 }}
                                                    className={`w-[18px] h-[18px] rounded-full shadow-md flex items-center justify-center ${allEnabled
                                                        ? "bg-white translate-x-[24px]"
                                                        : noneEnabled
                                                            ? "bg-slate-400 translate-x-[3px]"
                                                            : "bg-white translate-x-[3px]"
                                                        }`}
                                                >
                                                    {allEnabled && <Check className="w-3 h-3 text-emerald-600" />}
                                                    {!allEnabled && !noneEnabled && <div className="w-2.5 h-0.5 rounded-full bg-amber-600" />}
                                                </motion.div>
                                            </div>

                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-slate-500" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-slate-500" />
                                            )}
                                        </div>
                                    </button>

                                    {/* Permission Items */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="border-t border-white/5 p-3 space-y-1">
                                                    {permEntries.map(([permKey, permLabel]) => {
                                                        const isEnabled = categoryPermissions[permKey];
                                                        const PermIcon = permissionIcons[permKey] || Shield;

                                                        return (
                                                            <div
                                                                key={permKey}
                                                                onClick={() => togglePermission(categoryKey, permKey)}
                                                                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${isEnabled
                                                                    ? "bg-white/[0.03] hover:bg-white/[0.05]"
                                                                    : "hover:bg-white/[0.02]"
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <PermIcon
                                                                        className={`w-4 h-4 ${isEnabled ? colors.text : "text-slate-600"
                                                                            }`}
                                                                    />
                                                                    <span
                                                                        className={`text-sm ${isEnabled ? "text-slate-200" : "text-slate-500"
                                                                            }`}
                                                                    >
                                                                        {permLabel}
                                                                    </span>
                                                                </div>

                                                                {/* Premium Toggle Switch */}
                                                                <div
                                                                    className={`relative w-[42px] h-[22px] rounded-full transition-all duration-300 flex items-center shadow-inner ${isEnabled
                                                                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                                                                        : "bg-slate-800/80 border border-slate-700/50"
                                                                        }`}
                                                                >
                                                                    <motion.div
                                                                        layout
                                                                        transition={{ type: "spring", stiffness: 700, damping: 30 }}
                                                                        className={`w-[16px] h-[16px] rounded-full shadow-md flex items-center justify-center ${isEnabled
                                                                            ? "bg-white translate-x-[22px]"
                                                                            : "bg-slate-400 translate-x-[3px]"
                                                                            }`}
                                                                    >
                                                                        {isEnabled && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                                                    </motion.div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* ── SECURITY NOTE ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-4 flex items-start gap-3"
                    >
                        <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs text-amber-400 font-medium">Security Note</p>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Permission changes take effect immediately after saving. The moderator&apos;s
                                interface will update in real-time to reflect their configured access level.
                                Actions beyond their permissions will be blocked both visually and at the API level.
                            </p>
                        </div>
                    </motion.div>

                    {/* Bottom spacer for save button visibility */}
                    <div className="h-6" />

                    {/* ── BOTTOM SAVE BAR SECTION ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex flex-col sm:flex-row items-center justify-end gap-4 bg-transparent"
                    >
                        {hasChanges && (
                            <span className="text-sm text-amber-400 font-medium flex items-center gap-2 mr-auto sm:mr-4">
                                <AlertTriangle className="w-4 h-4" />
                                You have unsaved changes
                            </span>
                        )}

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            {hasChanges && (
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={resetChanges}
                                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-sm font-semibold flex items-center justify-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Reset
                                </motion.button>
                            )}

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={savePermissions}
                                disabled={!hasChanges || saving}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${hasChanges
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)] border border-blue-400/30"
                                    : "bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed"
                                    }`}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {saving ? "Saving Changes..." : "Save Configuration"}
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* Visual indicator of the bottom of the page */}
                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
}

/**
 * Merge partial permissions with defaults to handle missing fields
 */
function mergeWithDefaults(partial: Partial<ModeratorPermissions>): ModeratorPermissions {
    return {
        students: {
            ...DEFAULT_MODERATOR_PERMISSIONS.students,
            ...(partial.students || {}),
        },
        drivers: {
            ...DEFAULT_MODERATOR_PERMISSIONS.drivers,
            ...(partial.drivers || {}),
        },
        buses: {
            ...DEFAULT_MODERATOR_PERMISSIONS.buses,
            ...(partial.buses || {}),
        },
        routes: {
            ...DEFAULT_MODERATOR_PERMISSIONS.routes,
            ...(partial.routes || {}),
        },
        applications: {
            ...DEFAULT_MODERATOR_PERMISSIONS.applications,
            ...(partial.applications || {}),
        },
        payments: {
            ...DEFAULT_MODERATOR_PERMISSIONS.payments,
            ...(partial.payments || {}),
        },
    };
}
