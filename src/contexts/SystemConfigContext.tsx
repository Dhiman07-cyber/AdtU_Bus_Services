"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

interface SystemConfig {
    appName: string;
    busFee?: { amount: number };
    paymentExport?: { startYear: number; interval: number };
    academicYearEnd?: string;
    renewalReminder?: string;
    renewalDeadline?: string;
    softBlock?: string;
    hardBlock?: string;
    version?: string;
}

interface SystemConfigContextType {
    appName: string;
    config: SystemConfig | null;
    loading: boolean;
    refreshConfig: () => Promise<void>;
}

const SystemConfigContext = createContext<SystemConfigContextType>({
    appName: "AdtU Bus Services",
    config: null,
    loading: false,
    refreshConfig: async () => { },
});

export const SystemConfigProvider = ({ children }: { children: React.ReactNode }) => {
    const [config, setConfig] = useState<SystemConfig | null>(null);
    // Default to placeholder until loaded
    const [appName, setAppName] = useState("AdtU Bus Services");
    const [loading, setLoading] = useState(true);

    const fetchConfig = async () => {
        try {
            const response = await fetch('/api/settings/system-config');
            if (response.ok) {
                const data = await response.json();
                if (data.config) {
                    setConfig(data.config);
                    if (data.config.appName) {
                        setAppName(data.config.appName);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to load system config:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    return (
        <SystemConfigContext.Provider value={{ appName, config, loading, refreshConfig: fetchConfig }}>
            {children}
        </SystemConfigContext.Provider>
    );
};

export const useSystemConfig = () => useContext(SystemConfigContext);
