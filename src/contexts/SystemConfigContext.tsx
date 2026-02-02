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

// Cache keys and TTL
const CONFIG_CACHE_KEY = 'adtu_system_config';
const CONFIG_CACHE_EXPIRY_KEY = 'adtu_system_config_expiry';
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached config from localStorage
 */
function getCachedConfig(): SystemConfig | null {
    try {
        if (typeof window === 'undefined') return null;

        const cached = localStorage.getItem(CONFIG_CACHE_KEY);
        const expiry = localStorage.getItem(CONFIG_CACHE_EXPIRY_KEY);

        if (!cached || !expiry) return null;

        // Check if cache is expired
        if (Date.now() > parseInt(expiry)) {
            localStorage.removeItem(CONFIG_CACHE_KEY);
            localStorage.removeItem(CONFIG_CACHE_EXPIRY_KEY);
            return null;
        }

        return JSON.parse(cached);
    } catch (error) {
        console.warn('Failed to read config cache:', error);
        return null;
    }
}

/**
 * Save config to localStorage cache
 */
function setCachedConfig(config: SystemConfig | null): void {
    try {
        if (typeof window === 'undefined') return;

        if (config) {
            localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
            localStorage.setItem(CONFIG_CACHE_EXPIRY_KEY, (Date.now() + CONFIG_CACHE_TTL).toString());
        } else {
            localStorage.removeItem(CONFIG_CACHE_KEY);
            localStorage.removeItem(CONFIG_CACHE_EXPIRY_KEY);
        }
    } catch (error) {
        console.warn('Failed to cache config:', error);
    }
}

export const SystemConfigProvider = ({ children }: { children: React.ReactNode }) => {
    const [config, setConfig] = useState<SystemConfig | null>(null);
    // Default to placeholder until loaded
    const [appName, setAppName] = useState("AdtU Bus Services");
    const [loading, setLoading] = useState(true);

    const fetchConfig = async (bypassCache: boolean = false) => {
        try {
            // Try cache first (unless bypassing)
            if (!bypassCache) {
                const cachedConfig = getCachedConfig();
                if (cachedConfig) {
                    console.log('✅ Loaded system config from cache');
                    setConfig(cachedConfig);
                    if (cachedConfig.appName) {
                        setAppName(cachedConfig.appName);
                    }
                    setLoading(false);
                    return;
                }
            }

            const response = await fetch('/api/settings/system-config');
            if (response.ok) {
                const data = await response.json();
                if (data.config) {
                    setConfig(data.config);
                    setCachedConfig(data.config);
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
        // Load from cache first for instant display
        const cachedConfig = getCachedConfig();
        if (cachedConfig) {
            setConfig(cachedConfig);
            if (cachedConfig.appName) {
                setAppName(cachedConfig.appName);
            }
            setLoading(false);

            // Background refresh if cache is older than 2 minutes
            const expiry = localStorage.getItem(CONFIG_CACHE_EXPIRY_KEY);
            const cacheAge = expiry ? (Date.now() + CONFIG_CACHE_TTL - parseInt(expiry)) : CONFIG_CACHE_TTL;
            if (cacheAge > 2 * 60 * 1000) {
                // Silently refresh in background
                fetchConfig(true).then(() => {
                    console.log('🔄 System config background refresh complete');
                });
            }
        } else {
            fetchConfig();
        }
    }, []);

    // Refresh always bypasses cache
    const refreshConfig = async () => {
        await fetchConfig(true);
    };

    return (
        <SystemConfigContext.Provider value={{ appName, config, loading, refreshConfig }}>
            {children}
        </SystemConfigContext.Provider>
    );
};

export const useSystemConfig = () => useContext(SystemConfigContext);

