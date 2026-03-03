"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import {
    ModeratorPermissions,
    DEFAULT_MODERATOR_PERMISSIONS
} from '@/lib/types/moderator-permissions';

interface UseModeratorPermissionsReturn {
    permissions: ModeratorPermissions;
    loading: boolean;
    error: string | null;

    // Convenience helpers
    canStudentView: boolean;
    canStudentAdd: boolean;
    canStudentEdit: boolean;
    canStudentDelete: boolean;
    canStudentReassign: boolean;

    canDriverView: boolean;
    canDriverAdd: boolean;
    canDriverEdit: boolean;
    canDriverDelete: boolean;
    canDriverReassign: boolean;

    canBusView: boolean;
    canBusAdd: boolean;
    canBusEdit: boolean;
    canBusDelete: boolean;
    canBusReassign: boolean;

    canRouteView: boolean;
    canRouteAdd: boolean;
    canRouteEdit: boolean;
    canRouteDelete: boolean;

    canApplicationView: boolean;
    canApplicationApprove: boolean;
    canApplicationReject: boolean;
    canGenerateVerificationCode: boolean;
    canAppearInModeratorList: boolean;

    canApproveOfflinePayment: boolean;
    canRejectOfflinePayment: boolean;
}

// Cache for moderator permissions to avoid redundant reads
const permissionsCache = new Map<string, { data: ModeratorPermissions; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Hook to fetch and subscribe to moderator permissions.
 * 
 * - For moderators: fetches their own permissions from Firestore
 * - For admins: returns full permissions (admins can do everything)
 * - Uses real-time listener so permission changes are reflected immediately
 * 
 * Security: This is client-side enforcement only. API routes must ALSO
 * check permissions server-side for actual security.
 */
export function useModeratorPermissions(): UseModeratorPermissionsReturn {
    const { currentUser, userData } = useAuth();
    const [permissions, setPermissions] = useState<ModeratorPermissions>(DEFAULT_MODERATOR_PERMISSIONS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If admin, grant full permissions
        if (userData?.role === 'admin') {
            const { FULL_MODERATOR_PERMISSIONS } = require('@/lib/types/moderator-permissions');
            setPermissions(FULL_MODERATOR_PERMISSIONS);
            setLoading(false);
            return;
        }

        // If not moderator, use defaults
        if (!currentUser || userData?.role !== 'moderator') {
            setPermissions(DEFAULT_MODERATOR_PERMISSIONS);
            setLoading(false);
            return;
        }

        const uid = currentUser.uid;

        // Check cache first
        const cached = permissionsCache.get(uid);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setPermissions(cached.data);
            setLoading(false);
            // Still set up listener for real-time updates below
        }

        // Set up real-time listener on the moderator's document
        const modDocRef = doc(db, 'moderators', uid);
        const unsubscribe = onSnapshot(
            modDocRef,
            (docSnapshot) => {
                if (docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    const perms = data.permissions as ModeratorPermissions | undefined;

                    if (perms) {
                        // Merge with defaults to handle missing fields (backward compatibility)
                        const mergedPerms = mergeWithDefaults(perms);
                        setPermissions(mergedPerms);
                        permissionsCache.set(uid, { data: mergedPerms, timestamp: Date.now() });
                    } else {
                        // No permissions field yet - use defaults
                        setPermissions(DEFAULT_MODERATOR_PERMISSIONS);
                        permissionsCache.set(uid, { data: DEFAULT_MODERATOR_PERMISSIONS, timestamp: Date.now() });
                    }
                } else {
                    setPermissions(DEFAULT_MODERATOR_PERMISSIONS);
                }
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Error listening to moderator permissions:', err);
                setError('Failed to load permissions');
                setLoading(false);
                // Fall back to cached data if available
                const cached = permissionsCache.get(uid);
                if (cached) {
                    setPermissions(cached.data);
                }
            }
        );

        return () => unsubscribe();
    }, [currentUser, userData?.role]);

    return {
        permissions,
        loading,
        error,

        // Student
        canStudentView: permissions.students.canView,
        canStudentAdd: permissions.students.canAdd,
        canStudentEdit: permissions.students.canEdit,
        canStudentDelete: permissions.students.canDelete,
        canStudentReassign: permissions.students.canReassign,

        // Driver
        canDriverView: permissions.drivers.canView,
        canDriverAdd: permissions.drivers.canAdd,
        canDriverEdit: permissions.drivers.canEdit,
        canDriverDelete: permissions.drivers.canDelete,
        canDriverReassign: permissions.drivers.canReassign,

        // Bus
        canBusView: permissions.buses.canView,
        canBusAdd: permissions.buses.canAdd,
        canBusEdit: permissions.buses.canEdit,
        canBusDelete: permissions.buses.canDelete,
        canBusReassign: permissions.buses.canReassign,

        // Route
        canRouteView: permissions.routes.canView,
        canRouteAdd: permissions.routes.canAdd,
        canRouteEdit: permissions.routes.canEdit,
        canRouteDelete: permissions.routes.canDelete,

        // Application
        canApplicationView: permissions.applications.canView,
        canApplicationApprove: permissions.applications.canApprove,
        canApplicationReject: permissions.applications.canReject,
        canGenerateVerificationCode: permissions.applications.canGenerateVerificationCode,
        canAppearInModeratorList: permissions.applications.canAppearInModeratorList,

        // Payment
        canApproveOfflinePayment: permissions.payments.canApproveOfflinePayment,
        canRejectOfflinePayment: permissions.payments.canRejectOfflinePayment,
    };
}

/**
 * Merge partial permissions with defaults to ensure all fields exist.
 * This handles backward compatibility when new permission fields are added.
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
