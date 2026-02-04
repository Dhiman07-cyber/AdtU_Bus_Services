"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import {
  MapPin, Bell, Shield, Zap, Users, Bus, Clock, Target, Lock,
  PlayCircle, GraduationCap, Megaphone, Grid3x3, ArrowRight, Check
} from "lucide-react";

function LandingVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Video looping logic for 3:07 cutoff
  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.currentTime >= 187) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  return (
    <div className="relative aspect-video w-full max-w-2xl sm:max-w-3xl lg:max-w-none mx-auto">
      {/* Glassmorphic mockup */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-2xl sm:rounded-3xl backdrop-blur-xl border border-white/20 shadow-2xl"></div>

      {/* Video Content */}
      <div className="absolute inset-3 sm:inset-4 lg:inset-3 rounded-xl sm:rounded-2xl overflow-hidden shadow-inner bg-[#0F1117] border border-white/10">
        <video
          ref={videoRef}
          src="/landing_video/Welcome_Video.mp4"
          autoPlay
          muted
          playsInline
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full object-cover"
        />

        {/* Decorative overlay to maintain premium feel */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl sm:rounded-2xl pointer-events-none"></div>
      </div>
    </div>
  );
}

export default function PremiumLanding() {
  const { currentUser, userData, loading, needsApplication, signInWithGoogle } = useAuth();
  const { appName } = useSystemConfig();
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(false);
  const [animationKey, setAnimationKey] = useState(Date.now());


  // Restart animation on component mount (especially after sign out)
  useEffect(() => {
    // Force animation restart by updating key
    setAnimationKey(Date.now());
  }, []);

  // Redirect logic
  useEffect(() => {
    if (!loading && currentUser) {
      if (needsApplication) {
        console.log('🔄 Landing: Redirecting new user to application form');
        router.replace("/apply/form");
        return;
      }

      if (userData) {
        router.replace(`/${userData.role}`);
      }
    }
  }, [currentUser, userData, loading, needsApplication, router]);

  const handleSignIn = () => {
    // Redirect to login page instead of direct sign-in
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="loading-screen min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner w-12 h-12"></div>
          <p className="text-lg font-semibold">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Custom CSS for 3D effects and animations */}
      <style jsx global>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        
        .transform-gpu {
          transform-style: preserve-3d;
        }
        
        .hover\\:rotate-y-12:hover {
          transform: rotateY(12deg) scale(1.05);
        }
        
        .hover\\:-rotate-y-12:hover {
          transform: rotateY(-12deg) scale(1.05);
        }
        
        @media (max-width: 768px) {
          .hover\:rotate-y-12:hover,
          .hover\:-rotate-y-12:hover {
            transform: none;
          }
        }

        @keyframes gradient-shift {
          0% {
            background-position: 200% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-gradient {
          animation: gradient-shift 1s linear infinite;
        }
        
        @keyframes gradient-shift-fast {
          0% {
            background-position: 200% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-gradient-fast {
          animation: gradient-shift-fast 1.5s linear infinite;
        }

        /* Enhanced Bus Movement - Consistent ON Route */
        @keyframes bus-move {
          /* Start at Home - Pause */
          0%, 5% {
            left: 16.67%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(0deg);
          }
          
          /* Forward Journey: Home → Campus (5% to 42%) */
          8% {
            left: 22%;
            top: 48.5%;
            transform: translate(-50%, -50%) rotateZ(-3deg) rotateY(0deg);
          }
          11% {
            left: 28%;
            top: 45%;
            transform: translate(-50%, -50%) rotateZ(-6deg) rotateY(0deg);
          }
          14% {
            left: 34%;
            top: 41%;
            transform: translate(-50%, -50%) rotateZ(-8deg) rotateY(0deg);
          }
          17% {
            left: 40%;
            top: 39%;
            transform: translate(-50%, -50%) rotateZ(-7deg) rotateY(0deg);
          }
          20% {
            left: 46%;
            top: 40%;
            transform: translate(-50%, -50%) rotateZ(-4deg) rotateY(0deg);
          }
          23% {
            left: 52%;
            top: 44%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(0deg);
          }
          26% {
            left: 58%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(4deg) rotateY(0deg);
          }
          29% {
            left: 64%;
            top: 57%;
            transform: translate(-50%, -50%) rotateZ(7deg) rotateY(0deg);
          }
          32% {
            left: 70%;
            top: 61%;
            transform: translate(-50%, -50%) rotateZ(8deg) rotateY(0deg);
          }
          35% {
            left: 76%;
            top: 61%;
            transform: translate(-50%, -50%) rotateZ(6deg) rotateY(0deg);
          }
          38% {
            left: 80%;
            top: 57%;
            transform: translate(-50%, -50%) rotateZ(3deg) rotateY(0deg);
          }
          40% {
            left: 82%;
            top: 53%;
            transform: translate(-50%, -50%) rotateZ(1deg) rotateY(0deg);
          }
          42% {
            left: 83.33%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(0deg);
          }
          
          /* Pause at Campus & Rotate (42% to 48%) */
          44% {
            left: 83.33%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(0deg);
          }
          46% {
            left: 83.33%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(180deg);
          }
          48% {
            left: 83.33%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(180deg);
          }
          
          /* Return Journey: Campus → Home (48% to 90%) */
          51% {
            left: 82%;
            top: 53%;
            transform: translate(-50%, -50%) rotateZ(-1deg) rotateY(180deg);
          }
          54% {
            left: 80%;
            top: 57%;
            transform: translate(-50%, -50%) rotateZ(-3deg) rotateY(180deg);
          }
          57% {
            left: 76%;
            top: 61%;
            transform: translate(-50%, -50%) rotateZ(-6deg) rotateY(180deg);
          }
          60% {
            left: 70%;
            top: 61%;
            transform: translate(-50%, -50%) rotateZ(-8deg) rotateY(180deg);
          }
          63% {
            left: 64%;
            top: 57%;
            transform: translate(-50%, -50%) rotateZ(-7deg) rotateY(180deg);
          }
          66% {
            left: 58%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(-4deg) rotateY(180deg);
          }
          69% {
            left: 52%;
            top: 44%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(180deg);
          }
          72% {
            left: 46%;
            top: 40%;
            transform: translate(-50%, -50%) rotateZ(4deg) rotateY(180deg);
          }
          75% {
            left: 40%;
            top: 39%;
            transform: translate(-50%, -50%) rotateZ(7deg) rotateY(180deg);
          }
          78% {
            left: 34%;
            top: 41%;
            transform: translate(-50%, -50%) rotateZ(8deg) rotateY(180deg);
          }
          81% {
            left: 28%;
            top: 45%;
            transform: translate(-50%, -50%) rotateZ(6deg) rotateY(180deg);
          }
          84% {
            left: 22%;
            top: 48.5%;
            transform: translate(-50%, -50%) rotateZ(3deg) rotateY(180deg);
          }
          87% {
            left: 16.67%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(180deg);
          }
          90% {
            left: 16.67%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(180deg);
          }
          
          /* Pause at Home & Rotate back (90% to 100%) */
          92% {
            left: 16.67%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(180deg);
          }
          96% {
            left: 16.67%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(360deg);
          }
          100% {
            left: 16.67%;
            top: 50%;
            transform: translate(-50%, -50%) rotateZ(0deg) rotateY(360deg);
          }
        }

        .animate-bus-route {
          animation: bus-move 14s linear infinite;
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }

        /* Premium Carousel Animations */
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .carousel-container {
          overflow: hidden;
          position: relative;
          width: 100%;
        }

        .carousel-track {
          display: flex;
          width: fit-content;
          animation: scroll 30s linear infinite;
          gap: 1rem;
        }

        .carousel-track:hover {
          animation-play-state: paused;
        }

        @media (min-width: 768px) {
          .carousel-track {
            gap: 1.5rem;
          }
        }

        /* Gradient masks for smooth fade */
        .carousel-container::before,
        .carousel-container::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          width: 100px;
          z-index: 2;
          pointer-events: none;
        }

        .carousel-container::before {
          left: 0;
          background: linear-gradient(to right, #0E0F12 0%, transparent 100%);
        }

        .carousel-container::after {
          right: 0;
          background: linear-gradient(to left, #0E0F12 0%, transparent 100%);
        }

        @media (max-width: 767px) {
          .carousel-container::before,
          .carousel-container::after {
            width: 50px;
          }
          .carousel-track {
            animation-duration: 25s;
          }
        }

        .bg-premium-base {
          background-color: #030712; /* obsidian */
        }
        
        .pattern-grid-premium {
          background-size: 50px 50px;
          background-image: linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
        }

        .pattern-dots-premium {
          background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 32px 32px;
        }

        .pattern-diagonal {
          background: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 10px,
            rgba(255, 255, 255, 0.01) 10px,
            rgba(255, 255, 255, 0.01) 11px
          );
        }

        .section-separator {
          height: 150px;
          width: 100%;
          background: linear-gradient(to bottom, transparent, rgba(15, 23, 42, 0.8), transparent);
          pointer-events: none;
        }

        .glass-card-premium {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .glow-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(59, 130, 246, 0.03), transparent 70%);
          pointer-events: none;
        }

        /* Ambient Background Animations */
        @keyframes drift-slow {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        .animate-drift-slow {
          animation: drift-slow 20s ease-in-out infinite;
        }
        
        @keyframes drift-medium {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-40px, 40px) rotate(5deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .animate-drift-medium {
          animation: drift-medium 15s ease-in-out infinite;
        }
      `}</style>

      {/* GLOBAL BACKGROUND - The source of seamless transitions */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Base Obsidian Black - The Premium Look */}
        <div className="absolute inset-0 bg-[#030712]"></div>

        {/* Global Grain/Grid Texture */}
        <div className="absolute inset-0 opacity-[0.4] pattern-diagonal"></div>
        <div className="absolute inset-0 opacity-[0.2] pattern-grid-premium"></div>

        {/* 1. Hero Glow (Blue/Purple) */}
        <div className="absolute top-[-10%] left-[20%] w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] animate-drift-slow opacity-60"></div>
        <div className="absolute top-[10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[100px] animate-drift-medium opacity-50"></div>

        {/* 2. Core Benefits Glow (Warm Amber/Rose touch) */}
        <div className="absolute top-[35%] left-[-10%] w-[900px] h-[900px] bg-rose-500/05 rounded-full blur-[150px] animate-drift-slow delay-1000"></div>

        {/* 3. Why Choose Us Glow (Teal/Cyan) */}
        <div className="absolute top-[55%] right-[0%] w-[800px] h-[800px] bg-teal-500/05 rounded-full blur-[150px] animate-drift-medium delay-2000"></div>

        {/* 4. Bottom Glow (Purple/Blue) */}
        <div className="absolute bottom-[-10%] left-[20%] w-[1000px] h-[800px] bg-indigo-900/10 rounded-full blur-[120px] animate-drift-slow"></div>
      </div>

      <section className="relative min-h-screen flex items-start lg:items-center justify-center px-4 sm:px-6 overflow-hidden pt-12 sm:pt-24 lg:pt-0 z-10">
        {/* Section specific background to match image */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#0e1015]"></div>
          <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[20%] left-[10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]"></div>
        </div>

        <div className="relative z-10 max-w-[1600px] mx-auto w-full grid lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          {/* Left: Content - REVERTED TO IMAGE STYLE */}
          <div className="lg:col-span-5 space-y-4 sm:space-y-6 lg:space-y-5 animate-fade-in lg:ml-8 relative z-10">
            <div className="inline-block px-4 sm:px-5 lg:px-4 py-2 sm:py-2.5 lg:py-1.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-lg animate-gradient-fast bg-[length:200%_auto] mb-4 lg:mb-3">
              <span className="text-xs sm:text-sm lg:text-xs font-bold text-blue-200 tracking-wide">✨ CAMPUS TRANSPORTATION</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-4xl xl:text-5xl font-bold leading-[1.1]">
              Safe. Simple.
              <br />
              <span className="bg-gradient-to-r from-pink-400 via-cyan-300 to-purple-400 bg-[length:200%_auto] animate-gradient-fast bg-clip-text text-transparent">Real-time</span>{" "}
              Campus Bus Tracking.
            </h1>

            <p className="text-sm sm:text-base lg:text-base text-[#B0B3B8] leading-relaxed max-w-2xl">
              Manage routes, monitor live bus locations, and keep students informed
              with instant notifications—built for modern campuses.
            </p>

            {/* Mobile Video Position */}
            <div className="block lg:hidden w-full my-8">
              <LandingVideo />
            </div>

            <div className="flex flex-wrap gap-3 sm:gap-4">
              <button
                onClick={handleSignIn}
                className="group px-4 sm:px-6 lg:px-5 py-2 sm:py-2.5 lg:py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm lg:text-sm hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                Sign In with Google
              </button>

              <button
                onClick={() => router.push('/how-it-works')}
                className="group px-4 sm:px-6 lg:px-5 py-2 sm:py-2.5 lg:py-2 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm lg:text-sm hover:bg-white/10 transition-all duration-300 backdrop-blur-sm flex items-center gap-2 cursor-pointer"
              >
                See How It Works
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 lg:w-4 lg:h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <div className="flex flex-wrap gap-3 sm:gap-6 lg:gap-4 pt-2 sm:pt-4 lg:pt-2">
              {["Real-time tracking", "Live routing", "Instant notifications"].map((item) => (
                <div key={item} className="flex items-center gap-1.5 sm:gap-2 text-[#B0B3B8]">
                  <Check className="w-3.5 h-3.5 sm:w-5 sm:h-5 lg:w-4 lg:h-4 text-green-400" />
                  <span className="text-xs sm:text-sm lg:text-xs">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Visual */}
          <div className="relative lg:col-span-7 hidden lg:block">
            <LandingVideo />
          </div>
        </div>
      </section>

      {/* Core Benefits Section - Emerald/Teal Aura */}
      <section className="relative py-16 sm:py-24 px-3 sm:px-4 md:px-6 z-10 overflow-hidden">
        {/* Section specific background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#0c1212]"></div>
          <div className="absolute top-[10%] right-[-5%] w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[10%] left-[-5%] w-[500px] h-[500px] bg-teal-600/10 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-12 sm:mb-16 md:mb-20 space-y-4">
            <div className="inline-block px-5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full backdrop-blur-md shadow-lg mb-4">
              <span className="text-xs sm:text-sm font-bold text-emerald-300 tracking-wide uppercase">⚡ Powering Mobility</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold px-2 tracking-tight text-white">
              Everything you need for{" "}
              <span className="block mt-2 text-emerald-400">
                campus transportation
              </span>
            </h2>
            <p className="text-sm sm:text-base md:text-xl text-slate-400 max-w-2xl mx-auto px-4 font-medium">
              A comprehensive suite of tools designed to revolutionize how your campus moves
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {[
              {
                icon: MapPin,
                title: "Real-time GPS Tracking",
                desc: "Live coordinate broadcasting every 5 seconds during active trips",
                color: "blue"
              },
              {
                icon: Bell,
                title: "Instant Verification",
                desc: "6-digit cryptographic codes for secure and fast student onboarding",
                color: "purple"
              },
              {
                icon: Grid3x3,
                title: "Smart Reassignment",
                desc: "Advanced load balancing engine to group students by stop and shift",
                color: "green"
              },
              {
                icon: Shield,
                title: "Immutable Ledger",
                desc: "Audit-safe financial oversight with append-only payment records",
                color: "orange"
              }
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="group relative p-6 sm:p-8 bg-slate-900/40 border border-slate-800/50 rounded-2xl md:rounded-3xl backdrop-blur-xl hover:bg-slate-800/60 hover:border-slate-700/50 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none"></div>
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-${feature.color}-500/20 to-${feature.color}-600/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 shadow-inner`}>
                    <Icon className={`w-6 h-6 sm:w-7 sm:h-7 text-${feature.color}-400`} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold mb-3 text-white tracking-tight">{feature.title}</h3>
                  <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-medium">{feature.desc}</p>

                  {/* Decorative corner glow */}
                  <div className={`absolute -bottom-8 -right-8 w-24 h-24 bg-${feature.color}-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Us - Indigo/Violet Aura */}
      <section className="relative py-16 sm:py-24 px-3 sm:px-4 md:px-6 z-10 overflow-hidden">
        {/* Section specific background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#0e0c15]"></div>
          <div className="absolute top-[20%] left-[-5%] w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[20%] right-[-5%] w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-12 sm:mb-16 space-y-4">
            <div className="inline-block px-5 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full backdrop-blur-md shadow-lg mb-4">
              <span className="text-xs sm:text-sm font-bold text-indigo-300 tracking-wide uppercase">✨ Experience Excellence</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold px-2 tracking-tight text-white leading-tight">
              The Smart Way to{" "}
              <span className="text-indigo-400">
                Travel on Campus
              </span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-3xl mx-auto px-4 font-medium">
              Join the evolution of campus mobility with our state-of-the-art tracking and management platform
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-16 sm:mb-24">
            {[
              { value: "24/7", label: "Uptime", icon: "🟢", gradient: "from-green-500 to-emerald-500" },
              { value: "<100ms", label: "Sync Latency", icon: "⚡", gradient: "from-yellow-400 to-orange-500" },
              { value: "Live", label: "Driver Swaps", icon: "🔄", gradient: "from-blue-500 to-cyan-500" },
              { value: "Secure", label: "Payment Ledger", icon: "🛡️", gradient: "from-purple-500 to-pink-500" }
            ].map((stat, idx) => (
              <div key={idx} className="group relative glass-card-premium rounded-2xl md:rounded-3xl p-6 sm:p-8 hover:bg-white/[0.05] transition-all duration-500 hover:-translate-y-2">
                <div className={`text-4xl sm:text-5xl mb-4 bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent font-extrabold tracking-tighter`}>
                  {stat.value}
                </div>
                <div className="text-sm sm:text-base text-slate-400 font-bold tracking-wide uppercase mb-3">{stat.label}</div>
                <div className="text-3xl md:group-hover:scale-125 transition-transform duration-500">{stat.icon}</div>
              </div>
            ))}
          </div>

          {/* Benefits - 2 Column Layout */}
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            {/* Left Column */}
            <div className="space-y-6 lg:space-y-8">
              {[
                { icon: "📍", title: "Live GPS Tracking", desc: "View real-time bus location on the map with Supabase-powered coordinate broadcasting every 5 seconds.", color: "from-blue-500 to-cyan-500" },
                { icon: "💰", title: "Hybrid Payments", desc: "Online Razorpay checkout with instant verification plus offline receipt upload for manually verified payments.", color: "from-purple-500 to-pink-500" },
                { icon: "🔐", title: "Role-Based Auth", desc: "Firebase authentication with distinct workflows for Students, Drivers, Moderators, and Admins.", color: "from-emerald-500 to-green-500" }
              ].map((benefit, i) => (
                <div key={i} className="flex items-start gap-6 p-6 sm:p-8 glass-card-premium rounded-3xl hover:bg-white/[0.06] transition-all duration-500 group">
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br ${benefit.color} rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
                    <span className="text-3xl">{benefit.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">{benefit.title}</h3>
                    <p className="text-slate-400 leading-relaxed font-medium">
                      {benefit.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column */}
            <div className="space-y-6 lg:space-y-8">
              {[
                { icon: "🔔", title: "Instant Notifications", desc: "Get real-time alerts for session renewals, driver swaps, and system updates directly in your app dashboard.", color: "from-orange-500 to-red-500" },
                { icon: "🎫", title: "Digital Bus Pass", desc: "Instant access to your verified QR code bus pass for quick moderator scanning and university premises entry.", color: "from-indigo-500 to-purple-500" },
                { icon: "⚙️", title: "Smart Reassignment", desc: "Admin engine for atomic load balancing of students across buses grouped by stop and shift compatibility.", color: "from-rose-500 to-pink-500" }
              ].map((benefit, i) => (
                <div key={i} className="flex items-start gap-6 p-6 sm:p-8 glass-card-premium rounded-3xl hover:bg-white/[0.06] transition-all duration-500 group">
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br ${benefit.color} rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500`}>
                    <span className="text-3xl">{benefit.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">{benefit.title}</h3>
                    <p className="text-slate-400 leading-relaxed font-medium">
                      {benefit.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Built for Students & Drivers - Amber/Rose Aura */}
      <section className="relative py-16 sm:py-24 px-3 sm:px-4 md:px-6 overflow-hidden">
        {/* Section specific background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#120e0c]"></div>
          <div className="absolute top-[30%] right-[-10%] w-[600px] h-[600px] bg-amber-600/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[30%] left-[-10%] w-[500px] h-[500px] bg-rose-600/10 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-12 sm:mb-16 space-y-4">
            <div className="inline-block px-5 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full backdrop-blur-md shadow-lg mb-4">
              <span className="text-xs sm:text-sm font-bold text-amber-300 tracking-wide uppercase">👥 Unified Platform</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold px-2 tracking-tight text-white capitalize">
              Built for <span className="text-amber-400">Students</span> & <span className="text-rose-400">Drivers</span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-3xl mx-auto px-4 font-medium">
              A tailor-made experience for everyone involved in campus transit
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
            {/* Left Card - Student Experience */}
            <div className="group perspective-1000">
              <div className="relative transform-gpu transition-all duration-700 md:hover:rotate-y-12 md:hover:scale-[1.02] h-full">
                <div className="bg-gradient-to-br from-blue-900/40 to-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl h-full overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full"></div>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                      <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>

                    <h3 className="text-xl sm:text-2xl font-bold mb-4 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent tracking-tight">
                      Student Experience
                    </h3>

                    <ul className="space-y-3 mb-8 flex-1">
                      {[
                        "Real-time GPS bus tracking",
                        "Live ETA based on coordinates",
                        "Raise 'Waiting at Stop' flag",
                        "Digital QR Code Bus Pass",
                        "Automatic session renewals"
                      ].map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-slate-300">
                          <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="w-3 h-3 text-blue-400" />
                          </div>
                          <span className="text-sm sm:text-base font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => router.push('/how-it-works')}
                      className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-xl font-bold text-sm text-white shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                    >
                      Start Your Journey
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card - Driver Features */}
            <div className="group perspective-1000">
              <div className="relative transform-gpu transition-all duration-700 md:hover:-rotate-y-12 md:hover:scale-[1.02] h-full">
                <div className="bg-gradient-to-br from-teal-900/40 to-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl h-full overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-48 h-48 bg-teal-500/10 blur-[80px] rounded-full"></div>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500">
                      <Bus className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>

                    <h3 className="text-xl sm:text-2xl font-bold mb-4 bg-gradient-to-r from-white to-teal-200 bg-clip-text text-transparent tracking-tight">
                      Driver Features
                    </h3>

                    <ul className="space-y-3 mb-8 flex-1">
                      {[
                        "Start/End trip GPS broadcast",
                        "Real-time Driver Swap system",
                        "View student 'Waiting' flags",
                        "Daily route performance stats",
                        "Automated trip data archiving"
                      ].map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-slate-300">
                          <div className="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="w-3 h-3 text-teal-400" />
                          </div>
                          <span className="text-sm sm:text-base font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => router.push('/how-it-works')}
                      className="w-full px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 rounded-xl font-bold text-sm text-white shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                    >
                      Driver Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Statistics - Blue/Cyan Aura */}
      <section className="relative py-16 sm:py-24 px-3 sm:px-4 md:px-6 overflow-hidden">
        {/* Section specific background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#0c1015]"></div>
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-cyan-600/10 rounded-full blur-[150px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-12 sm:mb-16 space-y-4">
            <div className="inline-block px-5 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full backdrop-blur-md shadow-lg mb-4">
              <span className="text-xs sm:text-sm font-bold text-blue-300 tracking-wide uppercase">📊 Growing Community</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold text-white px-2 tracking-tight">
              Trusted by <span className="text-blue-400">students</span> & <span className="text-cyan-400">drivers</span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mx-auto px-4 font-medium">
              Join the thousands who rely on our platform every single day
            </p>
          </div>

          {/* Premium Carousel */}
          <div className="carousel-container py-4">
            <div className="carousel-track">
              {/* First set of cards */}
              {[
                { icon: MapPin, number: "5s", label: "GPS Refresh", sublabel: "Real-time updates", color: "from-blue-400 to-cyan-400" },
                { icon: Users, number: "Live", label: "Driver Swaps", sublabel: "Duty handovers", color: "from-green-400 to-emerald-400" },
                { icon: Target, number: "Smart", label: "Reassignment", sublabel: "Load balancing", color: "from-purple-400 to-pink-400" },
                { icon: Lock, number: "Secure", label: "Immutable Ledger", sublabel: "Payment safety", color: "from-yellow-400 to-orange-400" },
                { icon: Zap, number: "Instant", label: "QR Pass", sublabel: "Digital verification", color: "from-indigo-400 to-blue-400" },
                { icon: Shield, number: "Verified", label: "Roles", sublabel: "Access control", color: "from-red-400 to-pink-400" }
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div key={`first-${idx}`} className="group relative flex-shrink-0 w-[160px] sm:w-[200px] md:w-[220px] lg:w-[240px]">
                    {/* Glassmorphism Card */}
                    <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 sm:p-5 md:p-6 hover:bg-white/10 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 h-full">
                      {/* Inner Glow */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-xl"></div>

                      {/* Content */}
                      <div className="relative text-center space-y-2.5 sm:space-y-3">
                        {/* Icon with Gradient Background */}
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg`}>
                          <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>

                        {/* Number with Gradient Text */}
                        <div className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300 leading-tight`}>
                          {stat.number}
                        </div>

                        {/* Label */}
                        <div className="text-white font-semibold text-sm sm:text-base group-hover:text-blue-200 transition-colors duration-300 leading-tight">
                          {stat.label}
                        </div>

                        {/* Sublabel */}
                        <div className="text-xs text-[#9CA3AF] group-hover:text-[#D1D5DB] transition-colors duration-300">
                          {stat.sublabel}
                        </div>
                      </div>

                      {/* Hover Effect Border */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl"></div>
                    </div>
                  </div>
                );
              })}
              {/* Duplicate set for infinite scroll */}
              {[
                { icon: Users, number: "1,200+", label: "Student Trips", sublabel: "Per month", color: "from-blue-400 to-cyan-400" },
                { icon: Bus, number: "15+", label: "Active Buses", sublabel: "Daily routes", color: "from-green-400 to-emerald-400" },
                { icon: Target, number: "99.9%", label: "Accuracy", sublabel: "Live tracking", color: "from-purple-400 to-pink-400" },
                { icon: Clock, number: "24/7", label: "Support", sublabel: "Always available", color: "from-yellow-400 to-orange-400" },
                { icon: Zap, number: "<100ms", label: "Sync", sublabel: "Real-time", color: "from-indigo-400 to-blue-400" },
                { icon: Lock, number: "100%", label: "Secure", sublabel: "Data protected", color: "from-red-400 to-pink-400" }
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div key={`second-${idx}`} className="group relative flex-shrink-0 w-[160px] sm:w-[200px] md:w-[220px] lg:w-[240px]">
                    {/* Glassmorphism Card */}
                    <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 sm:p-5 md:p-6 hover:bg-white/10 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 h-full">
                      {/* Inner Glow */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-xl"></div>

                      {/* Content */}
                      <div className="relative text-center space-y-2.5 sm:space-y-3">
                        {/* Icon with Gradient Background */}
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg`}>
                          <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>

                        {/* Number with Gradient Text */}
                        <div className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300 leading-tight`}>
                          {stat.number}
                        </div>

                        {/* Label */}
                        <div className="text-white font-semibold text-sm sm:text-base group-hover:text-blue-200 transition-colors duration-300 leading-tight">
                          {stat.label}
                        </div>

                        {/* Sublabel */}
                        <div className="text-xs text-[#9CA3AF] group-hover:text-[#D1D5DB] transition-colors duration-300">
                          {stat.sublabel}
                        </div>
                      </div>

                      {/* Hover Effect Border */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl"></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-16">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10 rounded-full">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-[#B0B3B8]">Live system status</span>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-12 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6 overflow-hidden z-10">
        <div className="max-w-6xl mx-auto relative">
          {/* Left Content */}
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 md:gap-16 items-center">
            <div className="space-y-4 sm:space-y-6 md:space-y-8">
              <div className="space-y-3 sm:space-y-4 md:space-y-6">
                <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-lg mb-4">
                  <span className="text-xs sm:text-sm font-bold text-indigo-300 tracking-wide">🚀 READY TO START</span>
                </div>

                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                  Transform Your Campus Transportation
                </h2>

                <p className="text-sm sm:text-base md:text-lg text-[#B0B3B8] leading-relaxed">
                  Modern, secure, real-time bus management system designed for the future of campus mobility.
                  Join the growing community of students and drivers at Assam down town University.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={handleSignIn}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base md:text-lg text-white shadow-lg hover:shadow-xl hover:shadow-blue-500/25 transition-all duration-300 hover:scale-105 cursor-pointer"
                >
                  Sign In with Google
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:gap-6 text-xs sm:text-sm text-[#9CA3AF]">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Immutable Ledger</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span>Real-time Updates</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full animate-pulse"></div>
                  <span>Secure & Private</span>
                </div>
              </div>
            </div>

            {/* Right Visual */}
            <div className="relative">
              <div className="relative bg-gradient-to-br from-white/5 to-white/2 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl sm:rounded-3xl"></div>

                <div className="relative space-y-3 sm:space-y-4 md:space-y-6">
                  <div className="group flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl hover:bg-white/5 transition-all duration-300 cursor-pointer">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/30">
                      <Bus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white group-hover:text-blue-300 transition-colors">Live Bus Tracking</h3>
                      <p className="text-xs sm:text-sm text-[#B0B3B8]">Real-time location updates</p>
                    </div>
                  </div>

                  <div className="group flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl hover:bg-white/5 transition-all duration-300 cursor-pointer">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-green-500/30">
                      <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white group-hover:text-green-300 transition-colors">Instant Notifications</h3>
                      <p className="text-xs sm:text-sm text-[#B0B3B8]">Never miss an update</p>
                    </div>
                  </div>

                  <div className="group flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl hover:bg-white/5 transition-all duration-300 cursor-pointer">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-purple-500/30">
                      <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white group-hover:text-purple-300 transition-colors">Secure & Reliable</h3>
                      <p className="text-xs sm:text-sm text-[#B0B3B8]">Enterprise-grade security</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 bg-black/40 backdrop-blur-xl py-12 sm:py-16 px-4 sm:px-6 z-10">
        <div className="max-w-6xl mx-auto">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-6 lg:gap-4 xl:gap-6 mb-8 sm:mb-12">
            {/* Branding */}
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2 sm:space-y-3">
                <img src="/adtu-new-logo.svg" alt="AdtU Logo" className="w-36 sm:w-44 h-12 sm:h-16" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">AdtU Bus Services</h3>
                  <p className="text-xs sm:text-sm text-[#9CA3AF]">Official Real-Time Campus Transportation Management Platform</p>
                  <div className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-[#9CA3AF]">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full"></div>
                      <span>Live tracking & real-time updates</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-[#9CA3AF]">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full"></div>
                      <span>Secure & reliable campus transport</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Links & Support - 2 Column Grid on Mobile */}
            <div className="md:contents grid grid-cols-2 gap-6 col-span-1 md:col-span-2">
              {/* Quick Links */}
              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                  <span>🔗</span> Quick Links
                </h4>
                <ul className="space-y-2 sm:space-y-3">
                  <li><a href="https://adtu.in" target="_blank" rel="noopener noreferrer" className="text-[#B0B3B8] hover:text-white transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
                    <span>🌐</span> Website
                  </a></li>
                  <li><a href="https://apply.adtu.in/" target="_blank" rel="noopener noreferrer" className="text-[#B0B3B8] hover:text-white transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
                    <span>📝</span> Admission
                  </a></li>
                  <li><a href="https://adtu.in/files/2024/09/03/45783568.pdf" target="_blank" rel="noopener noreferrer" className="text-[#B0B3B8] hover:text-white transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
                    <span>📋</span> Grievance
                  </a></li>
                  <li><a href="https://adtu.in/anti-ragging.html" target="_blank" rel="noopener noreferrer" className="text-[#B0B3B8] hover:text-white transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
                    <span>🛡️</span> Anti Ragging
                  </a></li>
                </ul>
              </div>

              {/* Support */}
              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                  <span>☎</span> Support
                </h4>
                <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[#B0B3B8]">
                    <span>📞</span>
                    <span className="text-[11px] sm:text-xs">+91 93657 71454</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[#B0B3B8]">
                    <span>📞</span>
                    <span className="text-[11px] sm:text-xs">+91 91270 70577</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[#B0B3B8]">
                    <span>📞</span>
                    <span className="text-[11px] sm:text-xs">+91 60039 03319</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Legal */}
            <div className="space-y-3 sm:space-y-4">
              <h4 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <span>⚖</span> Legal
              </h4>
              <ul className="space-y-2 sm:space-y-3">
                <li><a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="text-[#B0B3B8] hover:text-white transition-colors text-xs sm:text-sm block">Terms & Conditions</a></li>
                <li><a href="https://adtu.in/privacy-and-policy/" target="_blank" rel="noopener noreferrer" className="text-[#B0B3B8] hover:text-white transition-colors text-xs sm:text-sm block">Privacy Policy</a></li>
              </ul>
            </div>

            {/* Campus View / 3D Virtual Tour */}
            <div className="space-y-3 sm:space-y-4">
              <h4 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <span>🏛</span> Campus View
              </h4>
              <div className="space-y-2 sm:space-y-3">
                <a href="https://adtu.in/view-360/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 border border-white/10 rounded-lg text-[#B0B3B8] hover:text-white hover:bg-white/10 transition-all duration-300 text-xs sm:text-sm">
                  <span>🎥</span> View 3D Campus Tour
                </a>
                <div className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
                  <div>Assam down town University,</div>
                  <div>Sankar Madhab Path, Gandhi Nagar,</div>
                  <div>Panikhaiti, Guwahati, Assam, India,</div>
                  <div>Pin – 781026</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-6 sm:pt-8">
            <div className="text-center">
              <div className="w-48 sm:w-64 h-px bg-white/10 mx-auto mb-3 sm:mb-4"></div>
              <div className="text-[#9CA3AF] text-xs sm:text-sm px-4">
                © 2025 AdtU Bus Services. Managed by Managing Team of AdtU. All Rights Reserved.
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
