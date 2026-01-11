"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import MonthDayPicker, { MonthDayValue, fromConfigFormat, toConfigFormat } from '@/components/month-day-picker';
import TimePicker, { TimeValue, fromConfigTime } from '@/components/time-picker';
import {
    Loader2,
    Save,
    RotateCcw,
    Calendar,
    Bell,
    Lock,
    Phone,
    Mail,
    Building,
    IndianRupee,
    XCircle,
    Settings2,
    Trash2,
    AlertTriangle,
    Sparkles,
    AlertCircle,
    Clock,
    Info,
    FileText,
    CreditCard,
    Shield,
    CheckCircle,
    Users,
    MapPin,
    Award,
    Zap,
    Home,
    Layers,
    Plus,
    UserCheck,
    ScrollText
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PremiumPageLoader } from '@/components/LoadingSpinner';
import { DeadlineConfig } from '@/lib/types/deadline-config';

// ============================================================================
// TYPES
// ============================================================================



interface UIConfig {
    description: string;
    version: string;
    lastUpdated: string;
    contactInfo: {
        description: string;
        officeName: string;
        phone: string;
        email: string;
        officeHours: string;
        address: string;
        visitInstructions: string;
    };
    applicationProcess: {
        description: string;
        steps: Array<{
            num: number;
            title: string;
            desc: string;
            icon: string;
            color: string;
        }>;
        importantNotes: Array<{
            icon: string;
            text: string;
        }>;
    };
    statistics: {
        description: string;
        items: Array<{
            label: string;
            value: string;
            icon: string;
            gradient: string;
        }>;
    };
    landingPage: {
        description: string;
        heroTitle: string;
        heroSubtitle: string;
        ctaTitle: string;
        ctaSubtitle: string;
        contactTitle: string;
        contactSubtitle: string;
        supportText: string;
    };
}

interface TermsSection {
    id: string;
    title: string;
    content: string;
}

interface TermsConfig {
    title: string;
    lastUpdated: string;
    sections: TermsSection[];
}

interface EditableDates {
    academicYearEnd: MonthDayValue | null;
    renewalNotificationStart: MonthDayValue | null;
    renewalDeadline: MonthDayValue | null;
    softBlockDate: MonthDayValue | null;
    hardDeleteDate: MonthDayValue | null;
    urgentWarningDays: number;
}

interface EditableTimes {
    renewalNotificationTime: TimeValue | null;
    renewalDeadlineTime: TimeValue | null;
    softBlockTime: TimeValue | null;
    hardDeleteTime: TimeValue | null;
}

// ============================================================================
// UTILITIES
// ============================================================================

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const getOrdinal = (day: number): string => {
    if (day > 3 && day < 21) return `${day}th`;
    switch (day % 10) {
        case 1: return `${day}st`;
        case 2: return `${day}nd`;
        case 3: return `${day}rd`;
        default: return `${day}th`;
    }
};

type TabType = 'system' | 'deadline' | 'onboarding' | 'landing' | 'terms' | 'privacy';

// ============================================================================
// FIELD COMPONENTS
// ============================================================================

function DateTimeField({
    id,
    label,
    dateValue,
    timeValue,
    originalDateValue,
    originalTimeValue,
    onDateChange,
    onTimeChange
}: {
    id: string;
    label: string;
    dateValue: MonthDayValue | null;
    timeValue: TimeValue | null;
    originalDateValue: MonthDayValue | null;
    originalTimeValue: TimeValue | null;
    onDateChange: (value: MonthDayValue) => void;
    onTimeChange: (value: TimeValue) => void;
}) {
    const dateChanged = dateValue?.month !== originalDateValue?.month || dateValue?.day !== originalDateValue?.day;
    const timeChanged = timeValue?.hour !== originalTimeValue?.hour || timeValue?.minute !== originalTimeValue?.minute;
    const hasChanged = dateChanged || timeChanged;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-gray-300">{label}</Label>
                {hasChanged && (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                        Modified
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <MonthDayPicker
                    id={`${id}-date`}
                    value={dateValue}
                    onChange={onDateChange}
                    placeholder="Date..."
                    showHelperText={false}
                    className="!bg-[#0A0B10] !border-white/10"
                />
                <TimePicker
                    id={`${id}-time`}
                    value={timeValue}
                    onChange={onTimeChange}
                    placeholder="Time..."
                    showHelperText={false}
                    className="!bg-[#0A0B10] !border-white/10"
                />
            </div>
        </div>
    );
}

function TextField({
    id,
    label,
    value,
    originalValue,
    onChange,
    type = 'text',
    placeholder,
    prefix,
    multiline = false
}: {
    id: string;
    label: string;
    value: string | number;
    originalValue: string | number;
    onChange: (value: string | number) => void;
    type?: 'text' | 'number' | 'tel' | 'email';
    placeholder?: string;
    prefix?: string;
    multiline?: boolean;
}) {
    const hasChanged = String(value) !== String(originalValue);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-gray-300">{label}</Label>
                <div className="flex items-center gap-2">
                    {hasChanged && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                            Modified
                        </span>
                    )}
                    {hasChanged && (
                        <button
                            type="button"
                            onClick={() => onChange(originalValue)}
                            className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Restore"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
            <div className="relative">
                {prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{prefix}</span>
                )}
                {multiline ? (
                    <Textarea
                        id={id}
                        value={String(value)}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        className="bg-[#0A0B10] border-white/10 text-white min-h-[80px] resize-none focus:border-indigo-500"
                    />
                ) : (
                    <Input
                        id={id}
                        type={type}
                        value={String(value)}
                        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
                        placeholder={placeholder}
                        className={`bg-[#0A0B10] border-white/10 text-white focus:border-indigo-500 h-11 ${prefix ? 'pl-8' : ''}`}
                    />
                )}
            </div>
        </div>
    );
}

function SectionHeader({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/5 rounded-lg">
                {icon}
            </div>
            <h3 className="text-white font-semibold">{title}</h3>
            {badge && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 rounded uppercase">
                    {badge}
                </span>
            )}
        </div>
    );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function TabButton({
    active,
    onClick,
    icon,
    label,
    badge
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    badge?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 min-w-fit ${active
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
        >
            {icon}
            <span>{label}</span>
            {badge && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${active ? 'bg-white/20' : 'bg-red-500/20 text-red-400'
                    }`}>
                    {badge}
                </span>
            )}
        </button>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SystemRenewalConfigPage() {
    const { currentUser, userData, loading: authLoading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('system');

    // System Config State
    const [systemConfig, setSystemConfig] = useState<{
        appName: string;
        busFee: number;
        paymentExport: { startYear: number; interval: number };
        version?: string;
    }>({
        appName: 'AdtU Bus Services',
        busFee: 5000,
        paymentExport: { startYear: 2027, interval: 1 },
        version: 'v2.4.0'
    });
    const [originalSystemConfig, setOriginalSystemConfig] = useState<{
        appName: string;
        busFee: number;
        paymentExport: { startYear: number; interval: number };
        version?: string;
    }>({
        appName: 'AdtU Bus Services',
        busFee: 5000,
        paymentExport: { startYear: 2027, interval: 1 },
        version: 'v2.4.0'
    });

    // Deadline Config State
    const [originalDeadlineConfig, setOriginalDeadlineConfig] = useState<DeadlineConfig | null>(null);
    const [dates, setDates] = useState<EditableDates>({
        academicYearEnd: null,
        renewalNotificationStart: null,
        renewalDeadline: null,
        softBlockDate: null,
        hardDeleteDate: null,
        urgentWarningDays: 15
    });
    const [originalDates, setOriginalDates] = useState<EditableDates>({
        academicYearEnd: null,
        renewalNotificationStart: null,
        renewalDeadline: null,
        softBlockDate: null,
        hardDeleteDate: null,
        urgentWarningDays: 15
    });
    const [times, setTimes] = useState<EditableTimes>({
        renewalNotificationTime: null,
        renewalDeadlineTime: null,
        softBlockTime: null,
        hardDeleteTime: null
    });
    const [originalTimes, setOriginalTimes] = useState<EditableTimes>({
        renewalNotificationTime: null,
        renewalDeadlineTime: null,
        softBlockTime: null,
        hardDeleteTime: null
    });
    const [softBlockWarning, setSoftBlockWarning] = useState('');
    const [originalSoftBlockWarning, setOriginalSoftBlockWarning] = useState('');
    const [hardDeleteWarning, setHardDeleteWarning] = useState('');
    const [originalHardDeleteWarning, setOriginalHardDeleteWarning] = useState('');

    // UI Config State
    const [originalUIConfig, setOriginalUIConfig] = useState<UIConfig | null>(null);
    const [contactInfo, setContactInfo] = useState({
        officeName: '',
        phone: '',
        email: '',
        officeHours: '',
        address: '',
        visitInstructions: ''
    });
    const [originalContactInfo, setOriginalContactInfo] = useState({
        officeName: '',
        phone: '',
        email: '',
        officeHours: '',
        address: '',
        visitInstructions: ''
    });
    const [applicationSteps, setApplicationSteps] = useState<any[]>([]);
    const [originalApplicationSteps, setOriginalApplicationSteps] = useState<any[]>([]);
    const [importantNotes, setImportantNotes] = useState<any[]>([]);
    const [originalImportantNotes, setOriginalImportantNotes] = useState<any[]>([]);
    const [statistics, setStatistics] = useState<any[]>([]);
    const [originalStatistics, setOriginalStatistics] = useState<any[]>([]);
    const [landingPage, setLandingPage] = useState({
        heroTitle: '',
        heroSubtitle: '',
        ctaTitle: '',
        ctaSubtitle: '',
        contactTitle: '',
        contactSubtitle: '',
        supportText: ''
    });
    const [originalLandingPage, setOriginalLandingPage] = useState({
        heroTitle: '',
        heroSubtitle: '',
        ctaTitle: '',
        ctaSubtitle: '',
        contactTitle: '',
        contactSubtitle: '',
        supportText: ''
    });

    // Terms Config State
    const [termsConfig, setTermsConfig] = useState<TermsConfig>({
        title: '',
        lastUpdated: '',
        sections: []
    });
    const [originalTermsConfig, setOriginalTermsConfig] = useState<TermsConfig | null>(null);

    // Privacy Config State
    const [privacyConfig, setPrivacyConfig] = useState<TermsConfig>({
        title: '',
        lastUpdated: '',
        sections: []
    });
    const [originalPrivacyConfig, setOriginalPrivacyConfig] = useState<TermsConfig | null>(null);

    // Load configurations
    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true);

            // Load deadline config
            const deadlineResponse = await fetch('/api/settings/deadline-config');
            if (deadlineResponse.ok) {
                const data = await deadlineResponse.json();
                const config = data.config as DeadlineConfig;
                setOriginalDeadlineConfig(config);

                // Set dates
                const editableDates: EditableDates = {
                    academicYearEnd: fromConfigFormat({ month: config.academicYear.anchorMonth, day: config.academicYear.anchorDay }),
                    renewalNotificationStart: fromConfigFormat({ month: config.renewalNotification.month, day: config.renewalNotification.day }),
                    renewalDeadline: fromConfigFormat({ month: config.renewalDeadline.month, day: config.renewalDeadline.day }),
                    softBlockDate: fromConfigFormat({ month: config.softBlock.month, day: config.softBlock.day }),
                    hardDeleteDate: fromConfigFormat({ month: config.hardDelete.month, day: config.hardDelete.day }),
                    urgentWarningDays: config.urgentWarningThreshold.days
                };
                setDates(editableDates);
                setOriginalDates({ ...editableDates });

                // Set times
                const editableTimes: EditableTimes = {
                    renewalNotificationTime: fromConfigTime({ hour: config.renewalNotification.hour, minute: config.renewalNotification.minute }),
                    renewalDeadlineTime: fromConfigTime({ hour: config.renewalDeadline.hour, minute: config.renewalDeadline.minute }),
                    softBlockTime: fromConfigTime({ hour: config.softBlock.hour, minute: config.softBlock.minute }),
                    hardDeleteTime: fromConfigTime({ hour: config.hardDelete.hour, minute: config.hardDelete.minute })
                };
                setTimes(editableTimes);
                setOriginalTimes({ ...editableTimes });

                setSoftBlockWarning(config.softBlock.warningText);
                setOriginalSoftBlockWarning(config.softBlock.warningText);
                setHardDeleteWarning(config.hardDelete.criticalWarningText);
                setOriginalHardDeleteWarning(config.hardDelete.criticalWarningText);
            }

            // Load UI config
            const uiResponse = await fetch('/api/settings/ui-config');
            if (uiResponse.ok) {
                const uiData = await uiResponse.json();
                const uiConfig = uiData.config as UIConfig;
                setOriginalUIConfig(uiConfig);

                if (uiConfig.contactInfo) {
                    setContactInfo(uiConfig.contactInfo);
                    setOriginalContactInfo({ ...uiConfig.contactInfo });
                }
                if (uiConfig.applicationProcess?.steps) {
                    setApplicationSteps(uiConfig.applicationProcess.steps);
                    setOriginalApplicationSteps([...uiConfig.applicationProcess.steps]);
                }
                if (uiConfig.applicationProcess?.importantNotes) {
                    setImportantNotes(uiConfig.applicationProcess.importantNotes);
                    setOriginalImportantNotes([...uiConfig.applicationProcess.importantNotes]);
                }
                if (uiConfig.statistics?.items) {
                    setStatistics(uiConfig.statistics.items);
                    setOriginalStatistics([...uiConfig.statistics.items]);
                }
                if (uiConfig.landingPage) {
                    setLandingPage(uiConfig.landingPage);
                    setOriginalLandingPage({ ...uiConfig.landingPage });
                }
            }

            // Load system config
            const systemResponse = await fetch('/api/settings/system-config');
            if (systemResponse.ok) {
                const data = await systemResponse.json();
                const config = data.config;
                const newSystemConfig = {
                    appName: config.appName || 'AdtU Bus Services',
                    busFee: config.busFee?.amount || 5000,
                    paymentExport: {
                        startYear: config.paymentExport?.startYear || 2027,
                        interval: config.paymentExport?.interval || 1
                    },
                    version: config.version || 'v2.4.0'
                };
                setSystemConfig(newSystemConfig);
                setOriginalSystemConfig(newSystemConfig);
            }

            // Load Terms config
            const termsResponse = await fetch('/api/settings/terms-config');
            if (termsResponse.ok) {
                const termsData = await termsResponse.json();
                const config = termsData.config as TermsConfig;
                setTermsConfig(config);
                setOriginalTermsConfig(JSON.parse(JSON.stringify(config)));
            }

            // Load Privacy config
            const privacyResponse = await fetch('/api/settings/privacy-config');
            if (privacyResponse.ok) {
                const privacyData = await privacyResponse.json();
                const config = privacyData.config as TermsConfig;
                setPrivacyConfig(config);
                setOriginalPrivacyConfig(JSON.parse(JSON.stringify(config)));
            }

        } catch (error) {
            console.error('Error loading configs:', error);
            showToast('Failed to load configuration', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadConfigs();
    }, [loadConfigs]);

    // Check for unsaved changes
    const hasSystemChanges = useCallback(() => {
        return JSON.stringify(systemConfig) !== JSON.stringify(originalSystemConfig);
    }, [systemConfig, originalSystemConfig]);

    const hasDeadlineChanges = useCallback(() => {
        return JSON.stringify(dates) !== JSON.stringify(originalDates) ||
            JSON.stringify(times) !== JSON.stringify(originalTimes) ||
            softBlockWarning !== originalSoftBlockWarning ||
            hardDeleteWarning !== originalHardDeleteWarning;
    }, [dates, originalDates, times, originalTimes, softBlockWarning, originalSoftBlockWarning, hardDeleteWarning, originalHardDeleteWarning]);

    const hasUIChanges = useCallback(() => {
        return JSON.stringify(contactInfo) !== JSON.stringify(originalContactInfo) ||
            JSON.stringify(applicationSteps) !== JSON.stringify(originalApplicationSteps) ||
            JSON.stringify(importantNotes) !== JSON.stringify(originalImportantNotes) ||
            JSON.stringify(statistics) !== JSON.stringify(originalStatistics) ||
            JSON.stringify(landingPage) !== JSON.stringify(originalLandingPage);
    }, [contactInfo, originalContactInfo, applicationSteps, originalApplicationSteps, importantNotes, originalImportantNotes, statistics, originalStatistics, landingPage, originalLandingPage]);

    const hasTermsChanges = useCallback(() => {
        return JSON.stringify(termsConfig) !== JSON.stringify(originalTermsConfig);
    }, [termsConfig, originalTermsConfig]);

    const hasPrivacyChanges = useCallback(() => {
        return JSON.stringify(privacyConfig) !== JSON.stringify(originalPrivacyConfig);
    }, [privacyConfig, originalPrivacyConfig]);

    const hasChanges = hasSystemChanges() || hasDeadlineChanges() || hasUIChanges() || hasTermsChanges() || hasPrivacyChanges();

    const handleSave = async () => {
        if (!currentUser) return;

        setSaving(true);
        try {
            const token = await currentUser.getIdToken();

            // Save system config if changed
            if (hasSystemChanges()) {
                const updatedSystemConfig = {
                    appName: systemConfig.appName,
                    busFee: { amount: systemConfig.busFee },
                    paymentExport: systemConfig.paymentExport,
                    version: systemConfig.version
                };

                const systemResponse = await fetch('/api/settings/system-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ config: updatedSystemConfig })
                });

                if (!systemResponse.ok) throw new Error('Failed to save system configuration');
                setOriginalSystemConfig({ ...systemConfig });
            }

            // Save deadline config if changed
            if (hasDeadlineChanges() && originalDeadlineConfig && dates.academicYearEnd && dates.renewalNotificationStart &&
                dates.renewalDeadline && dates.softBlockDate && dates.hardDeleteDate) {

                const academicConfig = toConfigFormat(dates.academicYearEnd);
                const notifConfig = toConfigFormat(dates.renewalNotificationStart);
                const deadlineConfig = toConfigFormat(dates.renewalDeadline);
                const softBlockConfig = toConfigFormat(dates.softBlockDate);
                const hardDeleteConfig = toConfigFormat(dates.hardDeleteDate);

                const updatedDeadlineConfig: DeadlineConfig = {
                    ...originalDeadlineConfig,
                    lastUpdated: new Date().toISOString().split('T')[0],
                    academicYear: {
                        ...originalDeadlineConfig.academicYear,
                        anchorMonth: academicConfig.month,
                        anchorMonthName: MONTH_NAMES[academicConfig.month],
                        anchorDay: academicConfig.day,
                        anchorDayOrdinal: getOrdinal(academicConfig.day)
                    },
                    renewalNotification: {
                        ...originalDeadlineConfig.renewalNotification,
                        month: notifConfig.month,
                        monthName: MONTH_NAMES[notifConfig.month],
                        day: notifConfig.day,
                        dayOrdinal: getOrdinal(notifConfig.day),
                        hour: times.renewalNotificationTime?.hour ?? 0,
                        minute: times.renewalNotificationTime?.minute ?? 5
                    },
                    renewalDeadline: {
                        ...originalDeadlineConfig.renewalDeadline,
                        month: deadlineConfig.month,
                        monthName: MONTH_NAMES[deadlineConfig.month],
                        day: deadlineConfig.day,
                        dayOrdinal: getOrdinal(deadlineConfig.day),
                        hour: times.renewalDeadlineTime?.hour ?? 23,
                        minute: times.renewalDeadlineTime?.minute ?? 59
                    },
                    softBlock: {
                        ...originalDeadlineConfig.softBlock,
                        month: softBlockConfig.month,
                        monthName: MONTH_NAMES[softBlockConfig.month],
                        day: softBlockConfig.day,
                        dayOrdinal: getOrdinal(softBlockConfig.day),
                        hour: times.softBlockTime?.hour ?? 0,
                        minute: times.softBlockTime?.minute ?? 5,
                        warningText: softBlockWarning
                    },
                    hardDelete: {
                        ...originalDeadlineConfig.hardDelete,
                        month: hardDeleteConfig.month,
                        monthName: MONTH_NAMES[hardDeleteConfig.month],
                        day: hardDeleteConfig.day,
                        dayOrdinal: getOrdinal(hardDeleteConfig.day),
                        hour: times.hardDeleteTime?.hour ?? 0,
                        minute: times.hardDeleteTime?.minute ?? 5,
                        criticalWarningText: hardDeleteWarning
                    },
                    urgentWarningThreshold: {
                        ...originalDeadlineConfig.urgentWarningThreshold,
                        days: dates.urgentWarningDays
                    },
                    paymentExportStartYear: originalDeadlineConfig.paymentExportStartYear, // Legacy: keep existing val
                    paymentExportInterval: originalDeadlineConfig.paymentExportInterval, // Legacy: keep existing val
                    timeline: {
                        ...originalDeadlineConfig.timeline,
                        events: [
                            { id: 'notification_start', date: { month: notifConfig.month, day: notifConfig.day }, time: { hour: times.renewalNotificationTime?.hour ?? 0, minute: times.renewalNotificationTime?.minute ?? 5 }, label: 'Renewal notification sent', color: 'green', icon: 'bell' },
                            { id: 'renewal_deadline', date: { month: deadlineConfig.month, day: deadlineConfig.day }, time: { hour: times.renewalDeadlineTime?.hour ?? 23, minute: times.renewalDeadlineTime?.minute ?? 59 }, label: 'Renewal deadline', color: 'orange', icon: 'calendar' },
                            { id: 'soft_block', date: { month: softBlockConfig.month, day: softBlockConfig.day }, time: { hour: times.softBlockTime?.hour ?? 0, minute: times.softBlockTime?.minute ?? 5 }, label: 'Account access blocked', color: 'red', icon: 'lock' },
                            { id: 'hard_delete', date: { month: hardDeleteConfig.month, day: hardDeleteConfig.day }, time: { hour: times.hardDeleteTime?.hour ?? 0, minute: times.hardDeleteTime?.minute ?? 5 }, label: 'Account permanently deleted', color: 'darkred', icon: 'trash', critical: true }
                        ]
                    }
                };

                // Explicitly remove legacy testingMode if it exists in original (sanitization)
                if ('testingMode' in updatedDeadlineConfig) {
                    delete (updatedDeadlineConfig as any).testingMode;
                }

                const deadlineResponse = await fetch('/api/settings/deadline-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ config: updatedDeadlineConfig })
                });
                if (!deadlineResponse.ok) {
                    const err = await deadlineResponse.json().catch(() => ({}));
                    throw new Error(err.message || 'Failed to save deadline configuration');
                }

                setOriginalDeadlineConfig(updatedDeadlineConfig);
                setOriginalDates({ ...dates });
                setOriginalTimes({ ...times });
                setOriginalSoftBlockWarning(softBlockWarning);
                setOriginalHardDeleteWarning(hardDeleteWarning);
            }

            // Save UI config if changed
            if (hasUIChanges()) {
                const updatedUIConfig = {
                    contactInfo,
                    applicationProcess: {
                        description: "Steps required to complete the bus service application process",
                        steps: applicationSteps,
                        importantNotes: importantNotes
                    },
                    statistics: {
                        description: "Platform statistics shown on the landing page",
                        items: statistics
                    },
                    landingPage
                };

                const uiResponse = await fetch('/api/settings/ui-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ config: updatedUIConfig })
                });
                if (!uiResponse.ok) throw new Error('Failed to save UI configuration');

                setOriginalContactInfo({ ...contactInfo });
                setOriginalApplicationSteps([...applicationSteps]);
                setOriginalImportantNotes([...importantNotes]);
                setOriginalStatistics([...statistics]);
                setOriginalLandingPage({ ...landingPage });
            }



            // Save Terms config if changed
            if (hasTermsChanges()) {
                const termsResponse = await fetch('/api/settings/terms-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ config: termsConfig })
                });
                if (!termsResponse.ok) throw new Error('Failed to save Terms configuration');
                setOriginalTermsConfig(JSON.parse(JSON.stringify(termsConfig)));
            }

            // Save Privacy config if changed
            if (hasPrivacyChanges()) {
                const privacyResponse = await fetch('/api/settings/privacy-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ config: privacyConfig })
                });
                if (!privacyResponse.ok) throw new Error('Failed to save Privacy configuration');
                setOriginalPrivacyConfig(JSON.parse(JSON.stringify(privacyConfig)));
            }

            showToast('Configuration saved successfully!', 'success');
            setShowConfirmDialog(false);
        } catch (error: any) {
            console.error('Error saving:', error);
            showToast(error.message || 'Failed to save', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRestoreAll = () => {
        setSystemConfig({ ...originalSystemConfig });
        setDates({ ...originalDates });
        setTimes({ ...originalTimes });
        setSoftBlockWarning(originalSoftBlockWarning);
        setHardDeleteWarning(originalHardDeleteWarning);
        setContactInfo({ ...originalContactInfo });
        setApplicationSteps([...originalApplicationSteps]);
        setImportantNotes([...originalImportantNotes]);
        setStatistics([...originalStatistics]);
        setLandingPage({ ...originalLandingPage });
        if (originalTermsConfig) {
            setTermsConfig(JSON.parse(JSON.stringify(originalTermsConfig)));
        }
        if (originalPrivacyConfig) {
            setPrivacyConfig(JSON.parse(JSON.stringify(originalPrivacyConfig)));
        }
        showToast('All changes reverted', 'info');
    };

    // Auth check
    if (authLoading || loading) {
        return <PremiumPageLoader message="Loading configuration..." />;
    }

    if (!currentUser || userData?.role !== 'admin') {
        return (
            <div className="min-h-screen bg-card flex items-center justify-center">
                <div className="text-center">
                    <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-white mb-4">Admin access required</p>
                    <Button onClick={() => router.push('/admin')}>Go to Dashboard</Button>
                </div>
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-card">
            <div className="pt-20 pb-32 px-4 sm:px-6 lg:px-8">
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl">
                            <Settings2 className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">System Configuration</h1>
                            <p className="text-gray-500 text-sm sm:text-base">Manage deadlines, UI content, and landing page</p>
                        </div>
                    </div>

                    {/* Desktop Tab Navigation (Hidden on Mobile) */}
                    <div className="hidden md:flex flex-wrap items-stretch gap-2 mb-6">
                        <TabButton
                            active={activeTab === 'system'}
                            onClick={() => setActiveTab('system')}
                            icon={<Settings2 className="h-4 w-4" />}
                            label="System Config"
                            badge={hasSystemChanges() ? '•' : undefined}
                        />
                        <TabButton
                            active={activeTab === 'deadline'}
                            onClick={() => setActiveTab('deadline')}
                            icon={<Calendar className="h-4 w-4" />}
                            label="Deadline Config"
                            badge={hasDeadlineChanges() ? '•' : undefined}
                        />
                        <TabButton
                            active={activeTab === 'onboarding'}
                            onClick={() => setActiveTab('onboarding')}
                            icon={<Layers className="h-4 w-4" />}
                            label="Application Info"
                        />
                        <TabButton
                            active={activeTab === 'landing'}
                            onClick={() => setActiveTab('landing')}
                            icon={<Home className="h-4 w-4" />}
                            label="Landing Page"
                        />
                        <TabButton
                            active={activeTab === 'terms'}
                            onClick={() => setActiveTab('terms')}
                            icon={<ScrollText className="h-4 w-4" />}
                            label="Terms & Conditions"
                            badge={hasTermsChanges() ? '•' : undefined}
                        />
                        <TabButton
                            active={activeTab === 'privacy'}
                            onClick={() => setActiveTab('privacy')}
                            icon={<Shield className="h-4 w-4" />}
                            label="Privacy Policy"
                            badge={hasPrivacyChanges() ? '•' : undefined}
                        />
                    </div>

                    {/* Mobile Navigation Removed as requested */}
                    <div className="md:hidden"></div>

                    {/* Content Area */}
                    <div className="bg-transparent md:bg-[#12131A] rounded-3xl md:border md:border-white/5 md:shadow-2xl">
                        <div className="p-0 md:p-8 space-y-16 md:space-y-0">

                            {/* SYSTEM CONFIG SECTION */}
                            <div id="system-section" className={`${activeTab === 'system' ? 'block' : 'block md:hidden'} animate-in fade-in duration-300`}>
                                <div className="md:hidden flex items-center gap-2 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                    <Settings2 className="h-4 w-4 text-indigo-400" />
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">System Config</h2>
                                </div>
                                <div className="bg-[#0E0F12] border border-white/10 rounded-2xl p-5 md:bg-transparent md:border-none md:p-0 md:rounded-none">
                                    <div className="space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
                                        {/* Global Bus Fee */}
                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<IndianRupee className="h-5 w-5 text-green-400" />} title="Global Bus Fee" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <TextField
                                                    id="busFee"
                                                    label="Annual Fee Amount"
                                                    type="number"
                                                    value={systemConfig.busFee}
                                                    originalValue={originalSystemConfig.busFee}
                                                    onChange={(v) => setSystemConfig(prev => ({ ...prev, busFee: Number(v) }))}
                                                    prefix="₹"
                                                    placeholder="5000"
                                                />
                                            </div>
                                        </section>

                                        {/* Payment Export Config */}
                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<IndianRupee className="h-5 w-5 text-purple-400" />} title="Payment Export" />
                                            <div className="pt-4 md:pt-0">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <TextField
                                                        id="exportStartYear"
                                                        label="Start Year"
                                                        type="number"
                                                        value={systemConfig.paymentExport.startYear}
                                                        originalValue={originalSystemConfig.paymentExport.startYear}
                                                        onChange={(v) => setSystemConfig(prev => ({ ...prev, paymentExport: { ...prev.paymentExport, startYear: Number(v) } }))}
                                                    />
                                                    <TextField
                                                        id="exportInterval"
                                                        label="Interval (Years)"
                                                        type="number"
                                                        value={systemConfig.paymentExport.interval}
                                                        originalValue={originalSystemConfig.paymentExport.interval}
                                                        onChange={(v) => setSystemConfig(prev => ({ ...prev, paymentExport: { ...prev.paymentExport, interval: Number(v) } }))}
                                                    />
                                                </div>
                                                <div className="mt-4 text-xs text-slate-500">
                                                    Next export scheduled for: <span className="text-white font-medium">{systemConfig.paymentExport.startYear + systemConfig.paymentExport.interval}</span>
                                                </div>
                                            </div>
                                        </section>

                                        {/* App Name Config - Occupies full width on desktop if not in grid */}
                                        <section className="col-span-1 md:col-span-2 space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<Settings2 className="h-5 w-5 text-blue-400" />} title="Application Settings" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <TextField
                                                    id="appName"
                                                    label="Application Name"
                                                    value={systemConfig.appName}
                                                    originalValue={originalSystemConfig.appName}
                                                    onChange={(v) => setSystemConfig(prev => ({ ...prev, appName: String(v) }))}
                                                    placeholder="AdtU Bus Services"
                                                />
                                                <TextField
                                                    id="version"
                                                    label="System Version"
                                                    value={systemConfig.version || ''}
                                                    originalValue={originalSystemConfig.version || ''}
                                                    onChange={(v) => setSystemConfig(prev => ({ ...prev, version: String(v) }))}
                                                    placeholder="v2.4.0"
                                                />
                                                <p className="text-xs text-gray-500">
                                                    This name appears in the navbar, page titles, and system emails.
                                                </p>
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </div>

                            {/* DEADLINE CONFIG SECTION */}
                            <div id="deadline-section" className={`${activeTab === 'deadline' ? 'block' : 'block md:hidden'} pt-10 md:pt-0`}>
                                <div className="md:hidden flex items-center gap-2 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                    <Calendar className="h-4 w-4 text-emerald-400" />
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Deadline Config</h2>
                                </div>
                                <div className="bg-[#0E0F12] border border-white/10 rounded-2xl p-5 md:bg-transparent md:border-none md:p-0 md:rounded-none">
                                    <div className="space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
                                        {/* Deadline Timeline */}
                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<Calendar className="h-5 w-5 text-emerald-400" />} title="Academic Year End" />
                                            <div className="pt-4 md:pt-0">
                                                <MonthDayPicker
                                                    id="academicYearEnd"
                                                    value={dates.academicYearEnd}
                                                    onChange={(v) => setDates(prev => ({ ...prev, academicYearEnd: v }))}
                                                    label="Service Expiry Date"
                                                    showHelperText={true}
                                                />
                                            </div>
                                        </section>

                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<Bell className="h-5 w-5 text-blue-400" />} title="Renewal Notification" />
                                            <div className="pt-4 md:pt-0">
                                                <DateTimeField
                                                    id="renewalNotification"
                                                    label="Notification Start"
                                                    dateValue={dates.renewalNotificationStart}
                                                    timeValue={times.renewalNotificationTime}
                                                    originalDateValue={originalDates.renewalNotificationStart}
                                                    originalTimeValue={originalTimes.renewalNotificationTime}
                                                    onDateChange={(v) => setDates(prev => ({ ...prev, renewalNotificationStart: v }))}
                                                    onTimeChange={(v) => setTimes(prev => ({ ...prev, renewalNotificationTime: v }))}
                                                />
                                            </div>
                                        </section>

                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<Calendar className="h-5 w-5 text-amber-400" />} title="Renewal Deadline" />
                                            <div className="pt-4 md:pt-0">
                                                <DateTimeField
                                                    id="renewalDeadline"
                                                    label="Deadline"
                                                    dateValue={dates.renewalDeadline}
                                                    timeValue={times.renewalDeadlineTime}
                                                    originalDateValue={originalDates.renewalDeadline}
                                                    originalTimeValue={originalTimes.renewalDeadlineTime}
                                                    onDateChange={(v) => setDates(prev => ({ ...prev, renewalDeadline: v }))}
                                                    onTimeChange={(v) => setTimes(prev => ({ ...prev, renewalDeadlineTime: v }))}
                                                />
                                            </div>
                                        </section>

                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<AlertTriangle className="h-5 w-5 text-red-400" />} title="Urgent Warning" />
                                            <div className="pt-4 md:pt-0">
                                                <TextField
                                                    id="urgentWarningDays"
                                                    label="Days Before Hard Delete"
                                                    type="number"
                                                    value={dates.urgentWarningDays}
                                                    originalValue={originalDates.urgentWarningDays}
                                                    onChange={(v) => setDates(prev => ({ ...prev, urgentWarningDays: Number(v) }))}
                                                />
                                            </div>
                                        </section>

                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<Lock className="h-5 w-5 text-orange-400" />} title="Soft Block" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <DateTimeField
                                                    id="softBlock"
                                                    label="Block Date & Time"
                                                    dateValue={dates.softBlockDate}
                                                    timeValue={times.softBlockTime}
                                                    originalDateValue={originalDates.softBlockDate}
                                                    originalTimeValue={originalTimes.softBlockTime}
                                                    onDateChange={(v) => setDates(prev => ({ ...prev, softBlockDate: v }))}
                                                    onTimeChange={(v) => setTimes(prev => ({ ...prev, softBlockTime: v }))}
                                                />
                                                <TextField
                                                    id="softBlockWarning"
                                                    label="Warning Message"
                                                    value={softBlockWarning}
                                                    originalValue={originalSoftBlockWarning}
                                                    onChange={(v) => setSoftBlockWarning(String(v))}
                                                    multiline
                                                />
                                            </div>
                                        </section>

                                        <section className="space-y-4 md:space-y-0 md:p-6 md:bg-[#0E0F12] md:rounded-2xl md:border md:border-white/10">
                                            <SectionHeader icon={<Trash2 className="h-5 w-5 text-red-400" />} title="Hard Delete" badge="CRITICAL" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <DateTimeField
                                                    id="hardDelete"
                                                    label="Delete Date & Time"
                                                    dateValue={dates.hardDeleteDate}
                                                    timeValue={times.hardDeleteTime}
                                                    originalDateValue={originalDates.hardDeleteDate}
                                                    originalTimeValue={originalTimes.hardDeleteTime}
                                                    onDateChange={(v) => setDates(prev => ({ ...prev, hardDeleteDate: v }))}
                                                    onTimeChange={(v) => setTimes(prev => ({ ...prev, hardDeleteTime: v }))}
                                                />
                                                <TextField
                                                    id="hardDeleteWarning"
                                                    label="Critical Warning"
                                                    value={hardDeleteWarning}
                                                    originalValue={originalHardDeleteWarning}
                                                    onChange={(v) => setHardDeleteWarning(String(v))}
                                                    multiline
                                                />
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </div>

                            {/* ONBOARDING SECTION */}
                            <div id="onboarding-section" className={`${activeTab === 'onboarding' ? 'block' : 'block md:hidden'} pt-10 md:pt-0`}>
                                <div className="md:hidden flex items-center gap-2 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                    <Layers className="h-4 w-4 text-indigo-400" />
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Application Info</h2>
                                </div>
                                <div className="bg-[#0E0F12] border border-white/10 rounded-2xl p-5 md:bg-transparent md:border-none md:p-0 md:rounded-none">
                                    <div className="space-y-6 md:space-y-10">

                                        {/* Contact Info */}
                                        <section className="space-y-4 md:space-y-6">
                                            <SectionHeader icon={<Building className="h-5 w-5 text-indigo-400" />} title="Contact Information" />
                                            <div className="pt-4 md:pt-0 space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <TextField
                                                        id="officeName"
                                                        label="Office Name"
                                                        value={contactInfo.officeName}
                                                        originalValue={originalContactInfo.officeName}
                                                        onChange={(v) => setContactInfo(prev => ({ ...prev, officeName: String(v) }))}
                                                    />
                                                    <TextField
                                                        id="phone"
                                                        label="Phone"
                                                        type="tel"
                                                        value={contactInfo.phone}
                                                        originalValue={originalContactInfo.phone}
                                                        onChange={(v) => setContactInfo(prev => ({ ...prev, phone: String(v) }))}
                                                    />
                                                    <TextField
                                                        id="email"
                                                        label="Email"
                                                        type="email"
                                                        value={contactInfo.email}
                                                        originalValue={originalContactInfo.email}
                                                        onChange={(v) => setContactInfo(prev => ({ ...prev, email: String(v) }))}
                                                    />
                                                    <TextField
                                                        id="officeHours"
                                                        label="Office Hours"
                                                        value={contactInfo.officeHours}
                                                        originalValue={originalContactInfo.officeHours}
                                                        onChange={(v) => setContactInfo(prev => ({ ...prev, officeHours: String(v) }))}
                                                    />
                                                </div>
                                                <div className="mt-4">
                                                    <TextField
                                                        id="address"
                                                        label="Address"
                                                        value={contactInfo.address}
                                                        originalValue={originalContactInfo.address}
                                                        onChange={(v) => setContactInfo(prev => ({ ...prev, address: String(v) }))}
                                                        multiline
                                                    />
                                                </div>
                                                <div className="mt-4">
                                                    <TextField
                                                        id="visitInstructions"
                                                        label="Visit Instructions"
                                                        value={contactInfo.visitInstructions}
                                                        originalValue={originalContactInfo.visitInstructions}
                                                        onChange={(v) => setContactInfo(prev => ({ ...prev, visitInstructions: String(v) }))}
                                                        multiline
                                                    />
                                                </div>
                                            </div>
                                        </section>

                                        {/* Application Steps */}
                                        <section className="space-y-4 md:space-y-6">
                                            <SectionHeader icon={<FileText className="h-5 w-5 text-blue-400" />} title="Application Process Steps" />
                                            <div className="pt-4 md:pt-0 space-y-4">
                                                {applicationSteps.map((step, index) => (
                                                    <div key={index} className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                                                                {step.num}
                                                            </div>
                                                            <Input
                                                                value={step.title}
                                                                onChange={(e) => {
                                                                    const updated = [...applicationSteps];
                                                                    updated[index] = { ...step, title: e.target.value };
                                                                    setApplicationSteps(updated);
                                                                }}
                                                                className="bg-transparent border-white/10 text-white font-medium"
                                                                placeholder="Step Title"
                                                            />
                                                        </div>
                                                        <Textarea
                                                            value={step.desc}
                                                            onChange={(e) => {
                                                                const updated = [...applicationSteps];
                                                                updated[index] = { ...step, desc: e.target.value };
                                                                setApplicationSteps(updated);
                                                            }}
                                                            className="bg-transparent border-white/10 text-gray-300 min-h-[60px] resize-none"
                                                            placeholder="Step description..."
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </section>

                                        {/* Important Notes */}
                                        <section className="space-y-4 md:space-y-6">
                                            <SectionHeader icon={<Info className="h-5 w-5 text-amber-400" />} title="Important Notes" />
                                            <div className="pt-4 md:pt-0 space-y-3">
                                                {importantNotes.map((note, index) => (
                                                    <div key={index} className="flex gap-3 p-3 bg-white/5 rounded-xl">
                                                        <div className="p-2 bg-amber-500/10 rounded-lg h-fit">
                                                            <Info className="h-4 w-4 text-amber-400" />
                                                        </div>
                                                        <Input
                                                            value={note.text}
                                                            onChange={(e) => {
                                                                const updated = [...importantNotes];
                                                                updated[index] = { ...note, text: e.target.value };
                                                                setImportantNotes(updated);
                                                            }}
                                                            className="bg-transparent border-white/10 text-gray-300 flex-1"
                                                            placeholder="Note text..."
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </div>

                            {/* LANDING SECTION */}
                            <div id="landing-section" className={`${activeTab === 'landing' ? 'block' : 'block md:hidden'} pt-10 md:pt-0`}>
                                <div className="md:hidden flex items-center gap-2 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                    <Home className="h-4 w-4 text-blue-400" />
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Landing Page</h2>
                                </div>
                                <div className="bg-[#0E0F12] border border-white/10 rounded-2xl p-5 md:bg-transparent md:border-none md:p-0 md:rounded-none">
                                    <div className="space-y-6 md:space-y-10">
                                        {/* Hero Section */}
                                        <section>
                                            <SectionHeader icon={<Home className="h-5 w-5 text-blue-400" />} title="Hero Section" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <TextField
                                                    id="heroTitle"
                                                    label="Hero Title"
                                                    value={landingPage.heroTitle}
                                                    originalValue={originalLandingPage.heroTitle}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, heroTitle: String(v) }))}
                                                />
                                                <TextField
                                                    id="heroSubtitle"
                                                    label="Hero Subtitle"
                                                    value={landingPage.heroSubtitle}
                                                    originalValue={originalLandingPage.heroSubtitle}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, heroSubtitle: String(v) }))}
                                                    multiline
                                                />
                                            </div>
                                        </section>

                                        {/* CTA Section */}
                                        <section>
                                            <SectionHeader icon={<Zap className="h-5 w-5 text-amber-400" />} title="Call to Action" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <TextField
                                                    id="ctaTitle"
                                                    label="CTA Title"
                                                    value={landingPage.ctaTitle}
                                                    originalValue={originalLandingPage.ctaTitle}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, ctaTitle: String(v) }))}
                                                />
                                                <TextField
                                                    id="ctaSubtitle"
                                                    label="CTA Subtitle"
                                                    value={landingPage.ctaSubtitle}
                                                    originalValue={originalLandingPage.ctaSubtitle}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, ctaSubtitle: String(v) }))}
                                                    multiline
                                                />
                                            </div>
                                        </section>

                                        {/* Contact Section */}
                                        <section>
                                            <SectionHeader icon={<Phone className="h-5 w-5 text-green-400" />} title="Contact Section" />
                                            <div className="space-y-4 pt-4 md:pt-0">
                                                <TextField
                                                    id="contactTitle"
                                                    label="Contact Title"
                                                    value={landingPage.contactTitle}
                                                    originalValue={originalLandingPage.contactTitle}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, contactTitle: String(v) }))}
                                                />
                                                <TextField
                                                    id="contactSubtitle"
                                                    label="Contact Subtitle"
                                                    value={landingPage.contactSubtitle}
                                                    originalValue={originalLandingPage.contactSubtitle}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, contactSubtitle: String(v) }))}
                                                    multiline
                                                />
                                                <TextField
                                                    id="supportText"
                                                    label="Support Text"
                                                    value={landingPage.supportText}
                                                    originalValue={originalLandingPage.supportText}
                                                    onChange={(v) => setLandingPage(prev => ({ ...prev, supportText: String(v) }))}
                                                />
                                            </div>
                                        </section>

                                        {/* Statistics */}
                                        <section>
                                            <SectionHeader icon={<Award className="h-5 w-5 text-purple-400" />} title="Platform Statistics" />
                                            <div className="pt-4 md:pt-0">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {statistics.map((stat, index) => (
                                                        <div key={index} className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                            <div className="flex gap-3">
                                                                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} opacity-20`}>
                                                                    <Award className="h-5 w-5 text-white" />
                                                                </div>
                                                                <div className="flex-1 space-y-2">
                                                                    <Input
                                                                        value={stat.label}
                                                                        onChange={(e) => {
                                                                            const updated = [...statistics];
                                                                            updated[index] = { ...stat, label: e.target.value };
                                                                            setStatistics(updated);
                                                                        }}
                                                                        className="bg-transparent border-white/10 text-gray-400 text-sm h-8"
                                                                        placeholder="Label"
                                                                    />
                                                                    <Input
                                                                        value={stat.value}
                                                                        onChange={(e) => {
                                                                            const updated = [...statistics];
                                                                            updated[index] = { ...stat, value: e.target.value };
                                                                            setStatistics(updated);
                                                                        }}
                                                                        className="bg-transparent border-white/10 text-white font-bold text-lg h-10"
                                                                        placeholder="Value"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </div>

                            {/* TERMS & CONDITIONS SECTION */}
                            <div id="terms-section" className={`${activeTab === 'terms' ? 'block' : 'block md:hidden'} pt-10 md:pt-0`}>
                                <div className="md:hidden flex items-center gap-2 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                    <ScrollText className="h-4 w-4 text-indigo-400" />
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Terms & Conditions</h2>
                                </div>
                                <div className="bg-[#0E0F12] border border-white/10 rounded-2xl p-5 md:bg-transparent md:border-none md:p-0 md:rounded-none">
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                                            {/* Page Header Edit */}
                                            <div className="lg:col-span-2 p-6 rounded-2xl bg-white/5 border border-white/5 md:bg-[#0E0F12] md:border-white/10 flex flex-col">
                                                <SectionHeader icon={<FileText className="h-5 w-5 text-indigo-400" />} title="Page Header" />
                                                <div className="mt-2">
                                                    <TextField
                                                        id="terms-title"
                                                        label="Document Title"
                                                        value={termsConfig.title}
                                                        originalValue={originalTermsConfig?.title || ''}
                                                        onChange={(val) => setTermsConfig(prev => ({ ...prev, title: String(val) }))}
                                                        placeholder="e.g. Terms & Conditions"
                                                    />
                                                </div>
                                            </div>

                                            {/* Preview Card */}
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 md:bg-[#0E0F12] md:border-white/10 flex flex-col justify-between">
                                                <div>
                                                    <SectionHeader icon={<Info className="h-5 w-5 text-blue-400" />} title="Quick Information" />
                                                    <div className="space-y-4 text-sm text-gray-400 mt-2">
                                                        <p>
                                                            The Terms & Conditions page is a public page accessible to all users.
                                                            Currently, it has <strong>{termsConfig.sections.length}</strong> sections.
                                                        </p>
                                                        <p>
                                                            Last Updated: <span className="text-white">{termsConfig.lastUpdated || 'Not set'}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    className="w-full mt-4 border-white/10 text-white hover:bg-white/5"
                                                    onClick={() => window.open('/terms-and-conditions', '_blank')}
                                                >
                                                    View Live Page
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Sections Editor */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between px-2">
                                                <h3 className="text-lg font-semibold text-white">Content Sections</h3>
                                                <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-md">
                                                    Total Sections: {termsConfig.sections.length}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                {termsConfig.sections.map((section, index) => (
                                                    <div key={index} className="p-6 rounded-2xl bg-white/5 border border-white/5 md:bg-[#0E0F12] md:border-white/10 space-y-4 relative group">
                                                        <div className="absolute top-4 right-4 z-10">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => {
                                                                    const newSections = [...termsConfig.sections];
                                                                    newSections.splice(index, 1);
                                                                    setTermsConfig(prev => ({ ...prev, sections: newSections }));
                                                                }}
                                                                className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                                title="Delete Section"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>

                                                        <TextField
                                                            id={`section-title-${index}`}
                                                            label="Section Title"
                                                            value={section.title}
                                                            originalValue={originalTermsConfig?.sections[index]?.title || ''}
                                                            onChange={(val) => {
                                                                const newSections = [...termsConfig.sections];
                                                                newSections[index].title = String(val);
                                                                setTermsConfig(prev => ({ ...prev, sections: newSections }));
                                                            }}
                                                            placeholder="e.g. 1. Introduction"
                                                        />

                                                        <div className="space-y-2">
                                                            <span className="text-sm font-medium text-gray-400">Content</span>
                                                            <Textarea
                                                                value={section.content}
                                                                onChange={(e) => {
                                                                    const newSections = [...termsConfig.sections];
                                                                    newSections[index].content = e.target.value;
                                                                    setTermsConfig(prev => ({ ...prev, sections: newSections }));
                                                                }}
                                                                className="bg-black/40 border-white/5 text-slate-300 min-h-[140px] resize-y focus:border-indigo-500/50 font-sans text-sm leading-relaxed"
                                                                placeholder="Enter section content..."
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setTermsConfig(prev => ({
                                                        ...prev,
                                                        sections: [
                                                            ...prev.sections,
                                                            { id: `section-${Date.now()}`, title: `${prev.sections.length + 1}. New Section`, content: '' }
                                                        ]
                                                    }));
                                                }}
                                                className="w-full border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-gray-400 hover:text-indigo-400 py-8"
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add New Content Section
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* PRIVACY SECTION */}
                            <div id="privacy-section" className={`${activeTab === 'privacy' ? 'block' : 'block md:hidden'} pt-10 md:pt-0`}>
                                <div className="md:hidden flex items-center gap-2 mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                                    <Shield className="h-4 w-4 text-emerald-400" />
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Privacy Policy</h2>
                                </div>

                                <div className="bg-[#0E0F12] border border-white/10 rounded-2xl p-5 md:bg-transparent md:border-none md:p-0 md:rounded-none">
                                    <div className="space-y-6 animate-in fade-in duration-300">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                                            {/* Page Header Edit */}
                                            <div className="lg:col-span-2 p-6 rounded-2xl bg-white/5 border border-white/5 md:bg-[#0E0F12] md:border-white/10 flex flex-col">
                                                <SectionHeader icon={<Shield className="h-5 w-5 text-emerald-400" />} title="Page Header" />
                                                <div className="mt-2">
                                                    <TextField
                                                        id="privacy-title"
                                                        label="Document Title"
                                                        value={privacyConfig.title}
                                                        originalValue={originalPrivacyConfig?.title || ''}
                                                        onChange={(val) => setPrivacyConfig(prev => ({ ...prev, title: String(val) }))}
                                                        placeholder="e.g. Privacy Policy"
                                                    />
                                                </div>
                                            </div>

                                            {/* Preview Card */}
                                            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 md:bg-[#0E0F12] md:border-white/10 flex flex-col justify-between">
                                                <div>
                                                    <SectionHeader icon={<Info className="h-5 w-5 text-blue-400" />} title="Quick Information" />
                                                    <div className="space-y-4 text-sm text-gray-400 mt-2">
                                                        <p>
                                                            The Privacy Policy is a public document outlining how user data is handled.
                                                            Currently, it has <strong>{privacyConfig.sections.length}</strong> sections.
                                                        </p>
                                                        <p>
                                                            Last Updated: <span className="text-white">{privacyConfig.lastUpdated || 'Not set'}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    className="w-full mt-4 border-white/10 text-white hover:bg-white/5"
                                                    onClick={() => window.open('/privacy-policy', '_blank')}
                                                >
                                                    View Live Page
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Sections Editor */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between px-2">
                                                <h3 className="text-lg font-semibold text-white">Content Sections</h3>
                                                <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-md">
                                                    Total Sections: {privacyConfig.sections.length}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                {privacyConfig.sections.map((section, index) => (
                                                    <div key={index} className="p-6 rounded-2xl bg-white/5 border border-white/5 md:bg-[#0E0F12] md:border-white/10 space-y-4 relative group">
                                                        <div className="absolute top-4 right-4 z-10">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => {
                                                                    const newSections = [...privacyConfig.sections];
                                                                    newSections.splice(index, 1);
                                                                    setPrivacyConfig(prev => ({ ...prev, sections: newSections }));
                                                                }}
                                                                className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                                title="Delete Section"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>

                                                        <TextField
                                                            id={`privacy-section-title-${index}`}
                                                            label="Section Title"
                                                            value={section.title}
                                                            originalValue={originalPrivacyConfig?.sections[index]?.title || ''}
                                                            onChange={(val) => {
                                                                const newSections = [...privacyConfig.sections];
                                                                newSections[index].title = String(val);
                                                                setPrivacyConfig(prev => ({ ...prev, sections: newSections }));
                                                            }}
                                                            placeholder="e.g. 1. Introduction"
                                                        />

                                                        <div className="space-y-2">
                                                            <span className="text-sm font-medium text-gray-400">Content</span>
                                                            <Textarea
                                                                value={section.content}
                                                                onChange={(e) => {
                                                                    const newSections = [...privacyConfig.sections];
                                                                    newSections[index].content = e.target.value;
                                                                    setPrivacyConfig(prev => ({ ...prev, sections: newSections }));
                                                                }}
                                                                className="bg-black/40 border-white/5 text-slate-300 min-h-[140px] resize-y focus:border-indigo-500/50 font-sans text-sm leading-relaxed"
                                                                placeholder="Enter section content..."
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setPrivacyConfig(prev => ({
                                                        ...prev,
                                                        sections: [
                                                            ...prev.sections,
                                                            { id: `section-${Date.now()}`, title: `${prev.sections.length + 1}. New Section`, content: '' }
                                                        ]
                                                    }));
                                                }}
                                                className="w-full border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-gray-400 hover:text-indigo-400 py-8"
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add New Content Section
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Save Bar */}
            {hasChanges && (
                <div className="fixed bottom-0 left-0 right-0 bg-[#12131A]/95 backdrop-blur-xl border-t border-white/10 p-4 z-50">
                    <div className="max-w-5xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-white font-medium">Unsaved Changes</span>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={handleRestoreAll} className="border-white/20 text-white hover:bg-white/10">
                                <RotateCcw className="h-4 w-4 mr-2" />Restore
                            </Button>
                            <Button
                                onClick={() => setShowConfirmDialog(true)}
                                disabled={saving}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                Save Configuration
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={showConfirmDialog}
                onOpenChange={setShowConfirmDialog}
                onConfirm={handleSave}
                title="Save Configuration"
                description="Are you sure you want to save these changes? This will update the system configuration immediately."
                confirmLabel={saving ? 'Saving...' : 'Save'}
                cancelLabel="Cancel"
                variant="warning"
            />
        </div >
    );
}
