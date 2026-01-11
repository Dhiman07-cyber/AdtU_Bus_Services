"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bus, LogIn, Chrome } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { signInWithGoogle, currentUser, userData, needsApplication } = useAuth();
  const router = useRouter();
  const isRedirectingRef = useRef(false);

  // Animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);



  // Redirect if already logged in
  useEffect(() => {
    console.log('🔄 Login page auth state:', {
      currentUser: !!currentUser,
      userData: !!userData,
      needsApplication,
      isRedirecting: isRedirectingRef.current
    });

    if (currentUser && userData) {
      // Set redirecting flag to prevent loading state reset
      console.log('🚀 Setting redirecting flag and redirecting to:', userData.role);
      isRedirectingRef.current = true;
      
      // Check for saved return URL
      const returnUrl = sessionStorage.getItem('returnUrl');
      
      if (returnUrl) {
        console.log('🔄 Redirecting to saved URL:', returnUrl);
        sessionStorage.removeItem('returnUrl'); // Clear after use
        router.push(returnUrl);
      } else {
        // Default role-based redirect
        switch (userData.role) {
          case "admin":
            router.push("/admin");
            break;
          case "moderator":
            router.push("/moderator");
            break;
          case "driver":
            router.push("/driver");
            break;
          case "student":
            router.push("/student");
            break;
          default:
            router.push("/");
        }
      }
    } else if (currentUser && needsApplication) {
      // User is logged in but needs to apply - redirect to apply page
      console.log('📝 User needs application, redirecting to apply page');
      isRedirectingRef.current = true;
      router.push("/apply");
    }
  }, [currentUser, userData, router, needsApplication]);

  const handleGoogleSignIn = async () => {
    console.log('🔄 Starting Google sign-in, setting loading to true');
    setLoading(true);
    setError("");

    try {
      const result = await signInWithGoogle();
      console.log('✅ Sign-in result:', result);

      if (result.needsApplication) {
        // User signed in successfully but needs to apply - redirect to apply page
        console.log('📝 User needs application, redirecting to apply page');
        isRedirectingRef.current = true;
        router.push("/apply");
        // Keep loading state active until redirect completes
        return;
      } else if (!result.success) {
        // Only reset loading state if sign-in failed and we're not redirecting
        console.log('❌ Sign-in failed, isRedirecting:', isRedirectingRef.current);
        if (!isRedirectingRef.current) {
          console.log('🔄 Resetting loading state due to sign-in failure');
          setLoading(false);
        }
        // Filter out permission errors and sign-in cancelled messages
        if (result.error &&
            result.error !== "Sign in was cancelled" &&
            !result.error.includes("permission") &&
            !result.error.includes("Missing or insufficient permissions")) {
          setError(result.error || "Failed to sign in");
        } else if (result.error === "Sign in was cancelled") {
          // User cancelled sign-in - this is normal behavior, don't show error
          console.log("User cancelled sign-in process");
        }
      } else {
        console.log('✅ Sign-in successful, keeping loading state until redirect');
      }
      // If result.success is true, keep loading state active until redirect happens via useEffect
    } catch (err: any) {
      // Reset loading state on error only if we're not redirecting
      console.log('💥 Sign-in error, isRedirecting:', isRedirectingRef.current);
      if (!isRedirectingRef.current) {
        console.log('🔄 Resetting loading state due to error');
        setLoading(false);
      }
      // Don't show permission errors - these are expected for new users
      if (!err.message?.includes("permission")) {
        setError("An unexpected error occurred");
      }
      console.error(err);
    }
  };

  const handleApplyNow = () => {
    setShowApplyModal(false);
    // Redirect to the apply page
    router.push("/apply");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0E0F12] via-[#12141A] to-[#0E0F12] p-4 transition-all duration-300 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(147,51,234,0.1),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_80%,rgba(16,185,129,0.1),transparent_50%)]"></div>
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-blue-500/10 rounded-full blur-xl animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-40 h-40 bg-purple-500/10 rounded-full blur-xl animate-pulse delay-1000"></div>
      <div className="absolute top-1/2 left-10 w-24 h-24 bg-green-500/10 rounded-full blur-xl animate-pulse delay-500"></div>
      
      <Card 
        className={`w-full max-w-md relative z-10 backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl transition-all duration-700 ${
          isVisible 
            ? 'opacity-100 translate-y-0 scale-100' 
            : 'opacity-0 translate-y-8 scale-95'
        }`}
      >
        <CardHeader className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 rounded-full shadow-lg">
                <Bus className="h-8 w-8 text-white animate-pulse" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-ping opacity-20"></div>
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
              ADTU Bus Login
            </CardTitle>
            <CardDescription className="text-base text-[#B0B3B8]">
              Sign in with your Google account to access the campus bus system
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 backdrop-blur-sm text-red-300 rounded-lg border border-red-500/20 animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                {error}
              </div>
            </div>
          )}
          <div className="space-y-4">
            <Button 
              onClick={handleGoogleSignIn}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 rounded-full animate-spin border-t-white mr-3"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <Chrome className="mr-3 h-5 w-5" />
                  Sign in with Google
                </>
              )}
            </Button>
          </div>
          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="h-px bg-white/20 flex-1"></div>
              <p className="text-sm text-[#B0B3B8] px-2">Secure Authentication</p>
              <div className="h-px bg-white/20 flex-1"></div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-3 pt-0">
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            Google OAuth 2.0 Protected
          </div>
        </CardFooter>
      </Card>

      {/* Apply for Bus Service Modal */}
      <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Bus Service</DialogTitle>
            <DialogDescription>
              We couldn't find an ADTU Bus account for this email. Would you like to apply for bus service?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              After submitting your application, it will be reviewed by a moderator and then approved by an admin.
              You'll receive a notification when your application is approved.
            </p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyNow}>
              Apply Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
