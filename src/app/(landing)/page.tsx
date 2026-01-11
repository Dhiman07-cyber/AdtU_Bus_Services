"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import {
  MapPin, Bell, Shield, Zap, Users, Bus, Clock, Target, Lock,
  PlayCircle, GraduationCap, Megaphone, Grid3x3, ArrowRight, Check
} from "lucide-react";

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
    <div className="min-h-screen bg-[#0E0F12] text-white overflow-x-hidden">
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
          animation: gradient-shift-fast 4s linear infinite;
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
      `}</style>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 overflow-hidden pt-16 lg:pt-0">
        {/* Enhanced Background Glow */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-[700px] h-[700px] bg-purple-500/15 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Content */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-5 animate-fade-in ml-10">
            <div className="inline-block px-4 sm:px-5 lg:px-4 py-2 sm:py-2.5 lg:py-1.5 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 border border-blue-400/40 rounded-full backdrop-blur-md shadow-lg shadow-blue-500/20 animate-gradient-fast bg-[length:200%_auto] mb-4 lg:mb-3">
              <span className="text-xs sm:text-sm lg:text-xs font-bold text-blue-300 tracking-wide">✨ CAMPUS TRANSPORTATION</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-4xl xl:text-5xl font-bold leading-[1.1]">
              Safe. Simple.
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-pink-600 to-pink-500 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                Real-time
              </span>{" "}
              Campus Bus Tracking.
            </h1>

            <p className="text-sm sm:text-base lg:text-base text-[#B0B3B8] leading-relaxed max-w-2xl">
              Manage routes, monitor live bus locations, and keep students informed
              with instant notifications—built for modern campuses.
            </p>

            <div className="flex flex-wrap gap-3 sm:gap-4">
              <button
                onClick={handleSignIn}
                className="group px-4 sm:px-6 lg:px-5 py-2 sm:py-2.5 lg:py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm lg:text-sm hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] transition-all duration-300 hover:scale-105"
              >
                Sign In with Google
              </button>

              <button
                onClick={() => router.push('/how-it-works')}
                className="group px-4 sm:px-6 lg:px-5 py-2 sm:py-2.5 lg:py-2 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm lg:text-sm hover:bg-white/10 transition-all duration-300 backdrop-blur-sm flex items-center gap-2"
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
          <div className="relative">
            <div className="relative aspect-square max-w-xs sm:max-w-lg lg:max-w-md xl:max-w-lg mx-auto">
              {/* Glassmorphic mockup */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-2xl sm:rounded-3xl backdrop-blur-xl border border-white/20 shadow-2xl"></div>

              {/* Premium Bus Tracking Interface */}
              <div className="absolute inset-3 sm:inset-4 lg:inset-3 bg-gradient-to-br from-[#0F1117] via-[#12141A] to-[#0F1117] rounded-xl sm:rounded-2xl border border-white/10 p-4 sm:p-6 lg:p-4 overflow-hidden shadow-inner">
                {/* Animated Background Grid */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.15) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    backgroundPosition: '0 0, 12px 12px'
                  }}></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5"></div>
                </div>

                {/* Enhanced Route Path */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.6" />
                      <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#A855F7" stopOpacity="0.6" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {/* Shadow path */}
                  <path
                    d="M 50 150 Q 100 100, 150 150 T 250 150"
                    stroke="url(#routeGradient)"
                    strokeWidth="6"
                    fill="none"
                    strokeDasharray="10 5"
                    opacity="0.3"
                    filter="url(#glow)"
                  />
                  {/* Main path */}
                  <path
                    d="M 50 150 Q 100 100, 150 150 T 250 150"
                    stroke="url(#routeGradient)"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray="10 5"
                    strokeLinecap="round"
                  />
                </svg>

                {/* Start Point */}
                <div className="absolute left-8 lg:left-6 top-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="absolute inset-0 w-6 h-6 sm:w-8 sm:h-8 lg:w-6 lg:h-6 rounded-full bg-green-400/20 blur-lg animate-pulse"></div>
                    <div className="relative w-6 h-6 sm:w-8 sm:h-8 lg:w-6 lg:h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg border-2 border-green-300/50"></div>
                    <div className="absolute -bottom-7 lg:-bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <span className="text-[10px] sm:text-xs lg:text-[10px] text-green-400 font-bold tracking-wider drop-shadow-lg">STOP</span>
                    </div>
                  </div>
                </div>

                {/* End Point */}
                <div className="absolute right-8 lg:right-6 top-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="absolute inset-0 w-6 h-6 sm:w-8 sm:h-8 lg:w-6 lg:h-6 rounded-full bg-purple-400/20 blur-lg animate-pulse"></div>
                    <div className="relative w-6 h-6 sm:w-8 sm:h-8 lg:w-6 lg:h-6 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-500 shadow-lg border-2 border-purple-300/50"></div>
                    <div className="absolute -bottom-7 lg:-bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <span className="text-[10px] sm:text-xs lg:text-[10px] text-purple-400 font-bold tracking-wider drop-shadow-lg">{appName.split(' ')[0]}</span>
                    </div>
                  </div>
                </div>

                {/* Animated Bus Icon - Moving along route */}
                <div key={animationKey} className="absolute -translate-x-1/2 -translate-y-1/2 animate-bus-route">
                  <div className="relative">
                    {/* Subtle glow effect */}
                    <div className="absolute inset-0 bg-blue-400/15 rounded-lg blur-md"></div>
                    {/* Premium Bus Icon */}
                    <Bus className="relative w-12 h-12 sm:w-16 sm:h-16 lg:w-12 lg:h-12 text-blue-400" style={{
                      filter: 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.4))',
                      strokeWidth: '1.5px'
                    }} />
                  </div>
                </div>

                {/* Live Status Badge */}
                <div className="absolute top-3 sm:top-4 lg:top-3 left-3 sm:left-4 lg:left-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-1.5 px-3 sm:px-4 lg:px-3 py-1.5 sm:py-2 lg:py-1.5 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/40 rounded-full backdrop-blur-md shadow-lg">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-1.5 lg:h-1.5 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                    <span className="text-[10px] sm:text-xs lg:text-[10px] text-green-300 font-bold tracking-wide">Live</span>
                  </div>
                </div>

                {/* ETA Badge */}
                <div className="absolute top-3 sm:top-4 lg:top-3 right-3 sm:right-4 lg:right-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-1.5 px-3 sm:px-4 lg:px-3 py-1.5 sm:py-2 lg:py-1.5 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-400/40 rounded-full backdrop-blur-md shadow-lg">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4 lg:w-3 lg:h-3 text-blue-300" />
                    <span className="text-[10px] sm:text-xs lg:text-[10px] text-blue-300 font-bold tracking-wide">8 min</span>
                  </div>
                </div>

                {/* Speed Indicator */}
                <div className="absolute bottom-3 sm:bottom-4 lg:bottom-3 left-3 sm:left-4 lg:left-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-1.5 px-3 sm:px-4 lg:px-3 py-1.5 sm:py-2 lg:py-1.5 bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border border-purple-400/40 rounded-full backdrop-blur-md shadow-lg">
                    <Zap className="w-3 h-3 sm:w-4 sm:h-4 lg:w-3 lg:h-3 text-purple-300" />
                    <span className="text-[10px] sm:text-xs lg:text-[10px] text-purple-300 font-bold tracking-wide">45 km/h</span>
                  </div>
                </div>

                {/* Students Count */}
                <div className="absolute bottom-3 sm:bottom-4 lg:bottom-3 right-3 sm:right-4 lg:right-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-1.5 px-3 sm:px-4 lg:px-3 py-1.5 sm:py-2 lg:py-1.5 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-400/40 rounded-full backdrop-blur-md shadow-lg">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 lg:w-3 lg:h-3 text-orange-300" />
                    <span className="text-[10px] sm:text-xs lg:text-[10px] text-orange-300 font-bold tracking-wide">24</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Benefits Section */}
      <section className="relative py-8 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6 bg-[#12141A]/50">
        {/* Small Circular Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1),transparent_60%)]"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-12 md:mb-20 space-y-2 sm:space-y-4">
            <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 border border-cyan-400/40 rounded-full backdrop-blur-md shadow-lg shadow-cyan-500/20 animate-gradient-fast bg-[length:200%_auto] mb-4">
              <span className="text-xs sm:text-sm font-bold text-cyan-300 tracking-wide">⚡ POWERFUL FEATURES</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold px-2">
              Everything you need for{" "}
              <br className="hidden md:block" />
              campus transportation
            </h2>
            <p className="text-xs sm:text-sm md:text-lg text-[#B0B3B8] max-w-3xl mx-auto px-2">
              Powerful features designed for modern campus transportation management
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {[
              {
                icon: MapPin,
                title: "Live Tracking & ETA",
                desc: "Real-time location updates with <100ms latency",
                color: "blue"
              },
              {
                icon: Bell,
                title: "Smart Notifications",
                desc: "Instant alerts via FCM and in-app notifications",
                color: "purple"
              },
              {
                icon: Grid3x3,
                title: "Role-Based Dashboards",
                desc: "Tailored interfaces for Students, Drivers, Moderators, Admins",
                color: "green"
              },
              {
                icon: Shield,
                title: "Secure & Reliable",
                desc: "Firebase-powered auth with encrypted data transmission",
                color: "orange"
              }
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="group relative p-3 sm:p-4 md:p-6 bg-white/[0.06] border border-white/10 rounded-lg sm:rounded-xl backdrop-blur-md hover:bg-white/[0.08] hover:scale-[1.03] hover:shadow-[0_20px_60px_rgba(59,130,246,0.3)] transition-all duration-300"
                >
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-${feature.color}-500/10 flex items-center justify-center mb-2 sm:mb-3 md:mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-${feature.color}-400`} />
                  </div>
                  <h3 className="text-xs sm:text-sm md:text-lg font-semibold mb-1 sm:mb-2 text-white leading-tight">{feature.title}</h3>
                  <p className="text-[10px] sm:text-xs md:text-sm text-[#B0B3B8] leading-snug">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Us - Benefits & Stats */}
      <section className="relative py-8 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6 bg-gradient-to-b from-[#12141A] via-[#0F1117] to-[#12141A]">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_70%)]"></div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-12 md:mb-16 space-y-2 sm:space-y-4">
            <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 border border-indigo-400/40 rounded-full backdrop-blur-md shadow-lg shadow-indigo-500/20 animate-gradient-fast bg-[length:200%_auto] mb-4">
              <span className="text-xs sm:text-sm font-bold text-indigo-300 tracking-wide">✨ WHY CHOOSE US</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold px-2">
              The Smart Way to{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Travel on Campus
              </span>
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-[#B0B3B8] max-w-3xl mx-auto px-4">
              Experience the future of campus transportation with cutting-edge technology
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {[
              { value: "99.9%", label: "Uptime", icon: "⚡", gradient: "from-green-500 to-emerald-500" },
              { value: "<100ms", label: "Real-Time Sync", icon: "🚀", gradient: "from-blue-500 to-cyan-500" },
              { value: "500+", label: "Active Users", icon: "👥", gradient: "from-purple-500 to-pink-500" },
              { value: "24/7", label: "Support", icon: "💬", gradient: "from-orange-500 to-amber-500" }
            ].map((stat, idx) => (
              <div key={idx} className="group relative bg-gradient-to-br from-white/5 to-white/2 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 hover:scale-105 transition-all duration-300 hover:shadow-2xl">
                <div className={`text-3xl sm:text-4xl mb-2 bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent font-bold`}>
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-[#B0B3B8] mb-2">{stat.label}</div>
                <div className="text-2xl">{stat.icon}</div>
              </div>
            ))}
          </div>

          {/* Benefits - 2 Column Layout */}
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* Left Column */}
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-start gap-4 p-4 sm:p-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/8 transition-all">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-2xl">📍</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Never Miss Your Bus</h3>
                  <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">
                    Real-time GPS tracking shows exact bus location and arrival time. Get instant notifications when your bus is nearby.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 sm:p-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/8 transition-all">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-2xl">💰</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Hassle-Free Payments</h3>
                  <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">
                    Secure online payments with Razorpay. Pay fees, renew passes, and manage transactions all in one place.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 sm:p-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/8 transition-all">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-2xl">🔐</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Secure & Private</h3>
                  <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">
                    Your data is protected with enterprise-grade security. Firebase authentication ensures safe access.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-start gap-4 p-4 sm:p-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/8 transition-all">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-2xl">⚡</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Lightning Fast Updates</h3>
                  <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">
                    Sub-100ms latency ensures you always see live bus locations. No delays, no waiting.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 sm:p-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/8 transition-all">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-2xl">📱</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Mobile-First Design</h3>
                  <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">
                    Beautiful, responsive interface works perfectly on any device. Track buses from anywhere.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 sm:p-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/8 transition-all">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-rose-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-2xl">🎯</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Smart Route Planning</h3>
                  <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">
                    Optimized routes save time. Drivers get efficient navigation for faster pickups and drop-offs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Built for Students & Drivers */}
      <section className="relative py-8 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6">
        {/* Small Circular Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.1),transparent_60%)]"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-12 md:mb-20 space-y-2 sm:space-y-4">
            <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 border border-purple-400/40 rounded-full backdrop-blur-md shadow-lg shadow-purple-500/20 animate-gradient-fast bg-[length:200%_auto] mb-4">
              <span className="text-xs sm:text-sm font-bold text-purple-300 tracking-wide">👥 STUDENT & DRIVER FOCUSED</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold px-2">
              Built for Students & Drivers
            </h2>
            <p className="text-xs sm:text-sm md:text-xl text-[#B0B3B8] max-w-3xl mx-auto px-2">
              Everything you need for seamless campus transportation
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 md:gap-12 items-stretch">
            {/* Left Card - Student Features */}
            <div className="group perspective-1000">
              <div className="relative transform-gpu transition-transform duration-700 md:hover:rotate-y-12 md:hover:scale-105">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-xl border border-white/20 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl h-full flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl sm:rounded-3xl"></div>
                  <div className="relative flex-1 flex flex-col">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mb-3 sm:mb-4 md:mb-6 md:group-hover:scale-110 md:group-hover:rotate-12 transition-all duration-500">
                      <GraduationCap className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
                    </div>

                    <h3 className="text-lg sm:text-xl md:text-3xl font-bold mb-3 sm:mb-4 md:mb-6 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
                      Student Experience
                    </h3>

                    <ul className="space-y-2 sm:space-y-3 md:space-y-4 mb-4 sm:mb-6 md:mb-8 flex-1">
                      {[
                        "Real-time bus tracking with live GPS",
                        "Instant notifications for delays & updates",
                        "Route planning with ETA predictions",
                        "Secure pass renewal & management",
                        "Emergency alerts & safety features"
                      ].map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 sm:gap-3 text-[#B0B3B8]">
                          <div className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-r from-green-400 to-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-white" />
                          </div>
                          <span className="text-xs sm:text-sm md:text-base leading-tight">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => router.push('/how-it-works')}
                      className="w-full px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm md:text-base text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                    >
                      Start Your Journey
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card - Driver Features */}
            <div className="group perspective-1000">
              <div className="relative transform-gpu transition-transform duration-700 md:hover:-rotate-y-12 md:hover:scale-105">
                <div className="bg-gradient-to-br from-green-500/20 to-teal-500/20 backdrop-blur-xl border border-white/20 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl h-full flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl sm:rounded-3xl"></div>
                  <div className="relative flex-1 flex flex-col">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center mb-3 sm:mb-4 md:mb-6 md:group-hover:scale-110 md:group-hover:-rotate-12 transition-all duration-500">
                      <Bus className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
                    </div>

                    <h3 className="text-lg sm:text-xl md:text-3xl font-bold mb-3 sm:mb-4 md:mb-6 bg-gradient-to-r from-white to-green-100 bg-clip-text text-transparent">
                      Driver Features
                    </h3>

                    <ul className="space-y-2 sm:space-y-3 md:space-y-4 mb-4 sm:mb-6 md:mb-8 flex-1">
                      {[
                        "Real-time route navigation",
                        "Student pickup notifications",
                        "Emergency alert system",
                        "Fuel & maintenance tracking",
                        "Performance analytics"
                      ].map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 sm:gap-3 text-[#B0B3B8]">
                          <div className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-r from-green-400 to-teal-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-white" />
                          </div>
                          <span className="text-xs sm:text-sm md:text-base leading-tight">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => router.push('/how-it-works')}
                      className="w-full px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm md:text-base text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
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

      {/* Statistics */}
      <section className="relative py-8 sm:py-16 md:py-24 lg:py-32 px-3 sm:px-4 md:px-6">
        {/* Small Circular Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.1),transparent_60%)]"></div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-12 md:mb-16 space-y-2 sm:space-y-4">
            <div className="inline-block px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-green-500/20 border border-green-400/40 rounded-full backdrop-blur-md shadow-lg shadow-green-500/20 animate-gradient-fast bg-[length:200%_auto] mb-4">
              <span className="text-xs sm:text-sm font-bold text-green-300 tracking-wide">📊 CAMPUS STATISTICS</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white px-2">
              Trusted by students & drivers
            </h2>
            <p className="text-xs sm:text-sm md:text-lg lg:text-xl text-[#B0B3B8] max-w-2xl mx-auto px-2">
              Join thousands of students and drivers who rely on our platform for seamless campus transportation
            </p>
          </div>

          {/* Premium Carousel */}
          <div className="carousel-container py-4">
            <div className="carousel-track">
              {/* First set of cards */}
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
      <section className="relative py-12 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6 overflow-hidden">
        {/* Enhanced Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 animate-pulse"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.15),transparent_60%)]"></div>

        <div className="max-w-6xl mx-auto relative">
          {/* Left Content */}
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 md:gap-16 items-center">
            <div className="space-y-4 sm:space-y-6 md:space-y-8">
              <div className="space-y-3 sm:space-y-4 md:space-y-6">
                <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 border border-indigo-400/40 rounded-full backdrop-blur-md shadow-lg shadow-indigo-500/20 animate-gradient-fast bg-[length:200%_auto] mb-4">
                  <span className="text-xs sm:text-sm font-bold text-indigo-300 tracking-wide">🚀 READY TO START</span>
                </div>

                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                  Transform Your Campus Transportation
                </h2>

                <p className="text-sm sm:text-base md:text-lg text-[#B0B3B8] leading-relaxed">
                  Modern, secure, real-time bus management system designed for the future of campus mobility.
                  Join thousands of students and drivers already using our platform.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={handleSignIn}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base md:text-lg text-white shadow-lg hover:shadow-xl hover:shadow-blue-500/25 transition-all duration-300 hover:scale-105"
                >
                  Sign In with Google
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:gap-6 text-xs sm:text-sm text-[#9CA3AF]">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>99.9% Uptime</span>
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
      <footer className="border-t border-white/10 bg-[#0E0F12] py-12 sm:py-16 px-4 sm:px-6">
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
