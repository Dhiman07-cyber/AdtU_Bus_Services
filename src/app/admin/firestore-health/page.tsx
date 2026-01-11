"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  HardDrive,
  FileText,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Activity
} from "lucide-react";
import { useToast } from "@/contexts/toast-context";

// ============================================
// FIRESTORE HEALTH METRICS INTERFACE
// ============================================
interface CollectionStat {
  name: string;
  count: number;
  percentage: number;
}

interface CollectionDetail {
  name: string;
  count: number;
  avgSizeKB: number;
  totalMB: number;
}

interface FirestoreMetrics {
  storageUsedMB: number;
  totalDocuments: number;
  avgDocumentSizeKB: number;
  updatedAt: string;
  projectId?: string;
  status?: string;
  storageIsEstimated?: boolean;
  note?: string | null;
  collectionStats?: Record<string, number>;
  topCollections?: CollectionStat[];
  collectionDetails?: CollectionDetail[];
  sampleSize?: number;
}

// ============================================
// FIRESTORE FREE TIER LIMITS
// ============================================
const FREE_TIER_LIMITS = {
  storageGB: 1, // 1 GB
};

export default function FirestoreHealthPage() {
  const router = useRouter();
  const { currentUser, userData } = useAuth();
  const { addToast } = useToast();

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const [metrics, setMetrics] = useState<FirestoreMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // AUTH CHECK - ADMIN ONLY
  // ============================================
  useEffect(() => {
    // Wait for auth to load completely
    if (currentUser === undefined || userData === undefined || userData === null) {
      console.log("⏳ Auth still loading...");
      return;
    }

    // If no current user, redirect to login
    if (!currentUser) {
      console.log("❌ No user - redirecting to login");
      router.push("/login");
      return;
    }

    // If userData exists but role is not admin, redirect
    // Only redirect if we're SURE they're not admin (userData loaded but role is wrong)
    if (userData && userData.role && userData.role !== "admin") {
      console.log("❌ Not admin - redirecting to login");
      router.push("/login");
      return;
    }

    // If we reach here and role is admin, allow access
    if (userData?.role === "admin") {
      console.log("✅ Admin authenticated - access granted");
    }
  }, [currentUser, userData, router]);

  // ============================================
  // FETCH FIRESTORE METRICS
  // ============================================
  const fetchMetrics = async () => {
    try {
      setRefreshing(true);
      setError(null);

      console.log("🔍 Fetching Firestore health metrics...");

      // Get Firebase auth token
      const user = currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }

      const token = await user.getIdToken();

      // Use our API endpoint (uses Firebase Admin SDK)
      const response = await fetch('/api/admin/firestore-health', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data: FirestoreMetrics = await response.json();

      console.log("✅ Firestore metrics received:", data);

      setMetrics(data);
      setLoading(false);
      setRefreshing(false);

      addToast("Firestore metrics updated successfully", "success");
    } catch (err: any) {
      console.error("❌ Error fetching Firestore metrics:", err);
      setError(err.message || "Failed to fetch Firestore metrics");
      setLoading(false);
      setRefreshing(false);

      addToast(
        "Failed to fetch Firestore metrics. Please try again.",
        "error"
      );
    }
  };

  // ============================================
  // INITIAL LOAD
  // ============================================
  useEffect(() => {
    if (currentUser?.uid && userData?.role === "admin") {
      fetchMetrics();
    }
  }, [currentUser, userData]);

  // ============================================
  // AUTO-REFRESH EVERY 5 MINUTES
  // ============================================
  // ============================================
  // AUTO-REFRESH DISABLED (Saves Quota)
  // ============================================
  /*
  useEffect(() => {
    // Only set up auto-refresh if user is authenticated as admin
    if (!currentUser?.uid || userData?.role !== "admin") {
      return;
    }

    const interval = setInterval(() => {
      if (!refreshing && currentUser?.uid && userData?.role === "admin") {
        console.log("🔄 Auto-refreshing Firestore metrics...");
        fetchMetrics();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [refreshing, currentUser, userData]);
  */

  // ============================================
  // CALCULATE USAGE PERCENTAGES
  // ============================================
  const getStoragePercentage = () => {
    if (!metrics) return 0;
    return Math.round((metrics.storageUsedMB / (FREE_TIER_LIMITS.storageGB * 1024)) * 100);
  };


  // ============================================
  // GET STATUS COLOR BASED ON USAGE
  // ============================================
  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-600 bg-red-50 border-red-200";
    if (percentage >= 70) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-green-600 bg-green-50 border-green-200";
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 90) return <AlertTriangle className="h-5 w-5 text-red-600" />;
    if (percentage >= 70) return <TrendingUp className="h-5 w-5 text-yellow-600" />;
    return <CheckCircle className="h-5 w-5 text-green-600" />;
  };

  const getStatusText = (percentage: number) => {
    if (percentage >= 90) return "Critical";
    if (percentage >= 70) return "Warning";
    return "Healthy";
  };

  // ============================================
  // AUTH LOADING STATE
  // ============================================
  // Show loading while auth is still initializing
  if (currentUser === undefined || userData === undefined) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-950">
        <div className="text-center space-y-6 p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-indigo-200 dark:border-gray-700">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 dark:border-gray-700 mx-auto"></div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-indigo-600 dark:border-t-indigo-400"></div>
          </div>
          <p className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // LOADING STATE
  // ============================================
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-950">
        <div className="text-center space-y-6 p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-blue-200 dark:border-gray-700">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-gray-700 mx-auto"></div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
          </div>
          <div className="space-y-2">
            <p className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Loading Firestore metrics...</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Fetching data from all collections</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // ERROR STATE
  // ============================================
  if (error && !metrics) {
    return (
      <div className="mt-12 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">Firestore Health Monitor</h1>
            <p className="text-gray-600 dark:text-gray-400">Monitor Firestore usage and quota limits</p>
          </div>
        </div>

        <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-2 border-red-300 dark:border-red-800 shadow-lg">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-red-600 dark:text-red-400">Error Loading Metrics</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-red-700 dark:text-red-300 mb-4 font-medium">{error}</p>
            <div className="bg-white dark:bg-gray-800/50 rounded-lg p-4 border border-red-200 dark:border-red-800/50">
              <h3 className="font-semibold mb-2 text-indigo-700 dark:text-indigo-400">Troubleshooting</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                The Firestore health metrics could not be loaded.
              </p>
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <p>• Make sure you are logged in as an admin</p>
                <p>• Check your internet connection</p>
                <p>• Verify Firebase credentials are configured correctly</p>
                <p>• Check browser console for detailed error messages</p>
              </div>
            </div>
            <Button onClick={fetchMetrics} className="mt-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 dark:from-red-500 dark:to-rose-500 dark:hover:from-red-600 dark:hover:to-rose-600 text-white shadow-lg hover:shadow-xl transition-all duration-300">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================
  // MAIN UI
  // ============================================
  return (
    <div className="mt-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
            Firestore Health Monitor
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Real-time monitoring of Firestore usage and quota limits
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={fetchMetrics}
            disabled={refreshing}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Last Updated */}
      {metrics && (
        <div className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800/50 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className="font-medium">Last updated:</span> {new Date(metrics.updatedAt).toLocaleString()} <span className="mx-2 text-gray-400 dark:text-gray-600">•</span> <span className="font-medium">Project:</span> {metrics.projectId}
        </div>
      )}


      {/* Data Accuracy Notice */}
      {metrics && metrics.note && (
        <Card className={`border-2 backdrop-blur-sm ${metrics.storageIsEstimated ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 dark:border-yellow-600' : 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-600'} shadow-lg`}>
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              {metrics.storageIsEstimated ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-semibold mb-1 ${metrics.storageIsEstimated ? 'text-yellow-800 dark:text-yellow-300' : 'text-green-800 dark:text-green-300'}`}>
                  {metrics.storageIsEstimated ? 'ℹ️ Estimated Data' : '✅ Actual Data (100% Accurate)'}
                </p>
                <p className={`text-xs ${metrics.storageIsEstimated ? 'text-yellow-700 dark:text-yellow-400' : 'text-green-700 dark:text-green-400'}`}>
                  {metrics.note}
                </p>
                {!metrics.storageIsEstimated && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-semibold">
                    🎯 Storage calculated from ALL {metrics.totalDocuments.toLocaleString()} documents - no sampling, no estimates!
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Essential Metrics */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Storage Usage */}
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border-2 border-blue-200 dark:border-blue-800 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-blue-200 dark:bg-blue-900/50 rounded-lg shadow-md">
                  <HardDrive className="h-8 w-8 text-blue-700 dark:text-blue-200" />
                </div>
                <Badge className={`${getStatusColor(getStoragePercentage())} text-sm font-extrabold px-4 py-1.5 shadow-md`}>
                  {getStoragePercentage()}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-4xl font-extrabold text-gray-950 dark:text-blue-100">
                  {metrics.storageUsedMB.toFixed(2)} MB
                </p>
                <p className="text-sm text-gray-800 dark:text-blue-200 font-semibold">
                  of {FREE_TIER_LIMITS.storageGB * 1024} MB (1 GB free tier)
                </p>
                <div className="w-full bg-blue-300/50 dark:bg-blue-900/30 rounded-full h-3 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-blue-700 to-indigo-700 dark:from-blue-400 dark:to-indigo-400 h-3 rounded-full transition-all duration-500 shadow-lg"
                    style={{ width: `${Math.min(getStoragePercentage(), 100)}%` }}
                  />
                </div>
                {metrics.avgDocumentSizeKB && metrics.sampleSize && (
                  <p className="text-sm text-gray-900 dark:text-blue-100 font-bold">
                    ⚡ Avg: {metrics.avgDocumentSizeKB.toFixed(2)} KB/doc ({metrics.sampleSize.toLocaleString()} docs)
                  </p>
                )}
                <p className="text-xs font-extrabold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Storage Used</p>
              </div>
            </CardContent>
          </Card>

          {/* Total Documents */}
          <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50 border-2 border-purple-200 dark:border-purple-800 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-purple-200 dark:bg-purple-900/50 rounded-lg shadow-md">
                  <FileText className="h-8 w-8 text-purple-700 dark:text-purple-200" />
                </div>
                <Activity className="h-6 w-6 text-purple-700 dark:text-purple-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-4xl font-extrabold text-gray-950 dark:text-purple-100">
                  {metrics.totalDocuments.toLocaleString()}
                </p>
                <p className="text-sm text-gray-800 dark:text-purple-200 font-semibold">
                  documents in database
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <Database className="h-5 w-5 text-purple-700 dark:text-purple-200" />
                  <span className="text-sm text-gray-900 dark:text-purple-100 font-bold">Active Collections</span>
                </div>
                <p className="text-xs font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Total Documents</p>
              </div>
            </CardContent>
          </Card>

        </div>
      )}


      {/* Collection Statistics Card */}
      {metrics && metrics.collectionDetails && metrics.collectionDetails.length > 0 && (
        <Card className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-950/50 dark:to-blue-950/50 border-2 border-cyan-200 dark:border-cyan-800 shadow-lg backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-gray-950 dark:text-cyan-100 flex items-center gap-2 text-xl">
              <Database className="h-6 w-6" />
              Collection Storage Breakdown
            </CardTitle>
            <CardDescription className="text-gray-700 dark:text-cyan-300 font-semibold">Document count and average size per collection</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.collectionDetails
                .sort((a, b) => b.totalMB - a.totalMB)
                .map((collection) => {
                  const totalKB = collection.totalMB * 1024;
                  const percentage = (collection.totalMB / metrics.storageUsedMB) * 100;
                  return (
                    <div key={collection.name} className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-cyan-200 dark:border-cyan-800/50 hover:border-cyan-400 dark:hover:border-cyan-600 transition-all duration-300 hover:shadow-md">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="p-2 bg-cyan-200 dark:bg-cyan-900/50 rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-sm">
                          <Database className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                        </div>
                        <div className="flex-1">
                          <p className="font-extrabold text-base text-gray-950 dark:text-gray-50">{collection.name}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-300 mt-1.5">
                            <span className="font-bold">{collection.count.toLocaleString()} docs</span>
                            <span className="text-gray-600 dark:text-gray-500">•</span>
                            <span className="font-semibold">{collection.avgSizeKB.toFixed(2)} KB avg</span>
                            <span className="text-gray-600 dark:text-gray-500">•</span>
                            <span className="text-cyan-700 dark:text-cyan-200 font-extrabold">{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-extrabold text-gray-950 dark:text-cyan-100">
                          {collection.totalMB >= 1
                            ? `${collection.totalMB.toFixed(2)} MB`
                            : `${totalKB.toFixed(0)} KB`
                          }
                        </p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 font-bold uppercase tracking-wide">actual</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
