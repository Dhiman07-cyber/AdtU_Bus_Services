"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/components/Analytics";
import { Bus } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sanitizeRedirectPath } from "@/lib/security/url-sanitizer";

function LoginContent() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { signInWithGoogle, currentUser, userData, needsApplication } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRedirectingRef = useRef(false);
  const [isMobile, setIsMobile] = useState(true);

  // Monitor viewport width to animate to correct responsive dimensions
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  // Trigger animations sequentially: fade-in the vertical line first, then widen the card
  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsExpanded(true);
    }, 100); // Start widening 100ms after fade-in starts to connect the transitions
    return () => clearTimeout(timer);
  }, []);

  // Redirect logic if already logged in
  useEffect(() => {
    console.log('🔄 Login page auth state:', {
      currentUser: !!currentUser,
      userData: !!userData,
      needsApplication,
      isRedirecting: isRedirectingRef.current
    });

    if (currentUser && userData) {
      console.log('🚀 Setting redirecting flag and redirecting to:', userData.role);
      isRedirectingRef.current = true;

      let queryRedirect = searchParams?.get('redirect');
      if (!queryRedirect && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        queryRedirect = urlParams.get('redirect');
      }
      const sessionRedirect = typeof window !== 'undefined' ? sessionStorage.getItem('returnUrl') : null;
      const returnUrl = queryRedirect || sessionRedirect;
      const safeReturnUrl = returnUrl ? sanitizeRedirectPath(returnUrl) : null;

      if (safeReturnUrl) {
        console.log('🔄 Redirecting to saved URL:', returnUrl);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('returnUrl');
        }
        router.push(safeReturnUrl);
      } else {
        if (returnUrl && typeof window !== 'undefined') {
          sessionStorage.removeItem('returnUrl');
        }
        switch (userData.role) {
          case "admin":
            trackEvent('admin_login');
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
      console.log('📝 User needs application, redirecting to apply page');
      isRedirectingRef.current = true;
      router.push("/apply");
    }
  }, [currentUser, userData, router, needsApplication, searchParams]);

  const handleGoogleSignIn = async () => {
    console.log('🔄 Starting Google sign-in, setting loading to true');
    setLoading(true);
    setError("");

    try {
      const result = await signInWithGoogle();
      console.log('✅ Sign-in result:', result);

      if (result.needsApplication) {
        console.log('📝 User needs application, redirecting to apply page');
        isRedirectingRef.current = true;
        router.push("/apply");
        return;
      } else if (!result.success) {
        console.log('❌ Sign-in failed, isRedirecting:', isRedirectingRef.current);
        if (!isRedirectingRef.current) {
          console.log('🔄 Resetting loading state due to sign-in failure');
          setLoading(false);
        }
        if (result.error &&
          result.error !== "Sign in was cancelled" &&
          !result.error.includes("permission") &&
          !result.error.includes("Missing or insufficient permissions")) {
          setError(result.error || "Failed to sign in");
        } else if (result.error === "Sign in was cancelled") {
          console.log("User cancelled sign-in process");
        }
      } else {
        console.log('✅ Sign-in successful, keeping loading state until redirect');
      }
    } catch (err: any) {
      console.log('💥 Sign-in error, isRedirecting:', isRedirectingRef.current);
      if (!isRedirectingRef.current) {
        console.log('🔄 Resetting loading state due to error');
        setLoading(false);
      }
      if (!err.message?.includes("permission")) {
        setError("An unexpected error occurred");
      }
      console.error(err);
    }
  };

  const handleApplyNow = () => {
    setShowApplyModal(false);
    router.push("/apply");
  };

  return (
    <div
      className="flex-1 min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundColor: '#000000',
        backgroundImage: 'radial-gradient(circle at 15% 25%, rgba(92, 89, 165, 0.22) 0%, rgba(92, 89, 165, 0) 55%), radial-gradient(circle at 85% 75%, rgba(92, 89, 165, 0.26) 0%, rgba(92, 89, 165, 0) 55%)'
      }}
    >
      {/* Butter-Smooth Card Container using GPU-accelerated Clip-Path */}
      <motion.div
        initial={{ 
          opacity: 0,
          clipPath: "inset(0% 50% 0% 50% round 28px)"
        }}
        animate={{ 
          opacity: isVisible ? 1 : 0,
          clipPath: isExpanded ? "inset(0% 0% 0% 0% round 28px)" : "inset(0% 50% 0% 50% round 28px)"
        }}
        transition={{
          opacity: { duration: 0.4, ease: "easeOut" },
          clipPath: { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
        }}
        className="w-full relative z-10 border-t border-b border-white/[0.08] flex flex-row overflow-hidden items-center rounded-[28px] max-w-[370px] sm:max-w-[850px] min-h-[440px] sm:min-h-[460px] shrink-0 justify-center login-card-container-motion"
        style={{
          background: 'radial-gradient(circle at bottom right, rgba(92, 89, 165, 0.08) 0%, rgba(92, 89, 165, 0) 50%), linear-gradient(135deg, #111115 0%, #0A0A0D 100%)'
        }}
      >
        {/* Inner Content Wrapper - maintains static dimensions to prevent text reflow */}
        <div className="w-[370px] sm:w-[850px] min-h-[440px] sm:min-h-[460px] flex flex-row items-center shrink-0 relative">

          {/* Left Section - AdtU Logo Panel (hidden on mobile, shown on desktop) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ 
              opacity: isExpanded ? 0.95 : 0,
              scale: isExpanded ? 1 : 0.92
            }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
            className="hidden sm:flex flex-col items-center justify-center p-6 shrink-0 select-none w-[400px] login-child-left"
          >
            <img
              src="/image.svg"
              alt="Assam down town University Logo"
              className="w-full max-w-[340px] h-auto object-contain opacity-95"
            />
          </motion.div>

          {/* Separator Pipe | (hidden on mobile, shown on desktop) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isExpanded ? 1 : 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            className="hidden sm:block h-52 w-px bg-white/[0.08] shrink-0 login-child-separator"
          />

          {/* Right Section - Login Content Form */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ 
              opacity: isExpanded ? 1 : 0,
              x: isExpanded ? 0 : 12
            }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
            className="flex-1 p-6 sm:p-10 sm:min-w-[340px] flex flex-col justify-center h-full login-child-right"
          >
            <div className="text-center space-y-5 p-0">
              <div className="flex justify-center">
                <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-[#18181F] border border-white/[0.06] shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
                  <Bus className="h-5.5 w-5.5 text-[#5c59a5]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold tracking-[0.25em] text-[#5c59a5] uppercase">
                  Transit Portal
                </p>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  AdtU ITMS Login
                </h2>
                <p className="text-xs text-zinc-300 max-w-[240px] mx-auto leading-relaxed">
                  Sign in with your campus Google credentials to access the bus system
                </p>
              </div>
            </div>

            <div className="p-0 mt-8">
              {error && (
                <div className="mb-5 p-3 bg-red-950/20 border border-red-900/30 text-red-200 rounded-xl flex items-start gap-2.5 text-xs animate-in fade-in duration-200">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 shrink-0 pulse-dot"></div>
                  <div className="flex-1 leading-relaxed">
                    {error}
                  </div>
                </div>
              )}

              <Button
                onClick={handleGoogleSignIn}
                className="w-full h-12 text-xs font-semibold bg-white hover:bg-zinc-100 !text-black border-0 rounded-xl active:scale-[0.98] transition-all duration-200 disabled:opacity-80 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black/30 rounded-full animate-spin border-t-black mr-2.5"></div>
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-4.5 h-4.5 mr-2.5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02C6.21 7.02 8.87 5.04 12 5.04z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.99 3.7-8.62z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.78c-.24-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28L1.39 7.56C.5 9.35 0 11.35 0 13.5s.5 4.15 1.39 5.94l3.89-3.02C4.9 16.34 4.76 15.58 5.28 14.78z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.73-2.89c-1.1.74-2.52 1.18-4.23 1.18-3.13 0-5.79-1.98-6.72-5.04l-3.89 3.02C3.37 20.33 7.35 23 12 23z"
                      />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </Button>

              <div className="relative flex items-center my-6">
                <div className="flex-grow border-t border-white/[0.06]"></div>
                <span className="flex-shrink mx-3 text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                  Secure Access
                </span>
                <div className="flex-grow border-t border-white/[0.06]"></div>
              </div>

              <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-500 font-semibold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Google OAuth Protected
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 min-h-[100dvh] flex items-center justify-center bg-[#000000]"></div>}>
      <LoginContent />
    </Suspense>
  );
}
