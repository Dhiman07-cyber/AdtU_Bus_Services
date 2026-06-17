"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/auth-context";
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import {
  MapPin, Bell, Shield, Bus, Clock, GraduationCap, ArrowRight, Check,
  PlayCircle, Users, CheckCircle2, Navigation, FileText, UserCheck, Settings,
  ChevronLeft, ChevronRight
} from "lucide-react";
import Footer from "@/components/Footer";

function LandingVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Fetch video URL from Supabase on mount and retry on error
  const fetchVideoUrl = async (retryCount = 0) => {
    try {
      setError(null);
      const response = await fetch('/api/landing-video', {
        cache: 'no-store' // Prevent caching issues during auth transitions
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.url) {
          setVideoUrl(data.url);
          retryCountRef.current = 0; // Reset retry count on success
        } else {
          throw new Error(data.error || 'Invalid video URL response');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Failed to fetch video URL (attempt ${retryCount + 1}):`, error);

      // Retry logic for transient errors
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        setTimeout(() => fetchVideoUrl(retryCount + 1), delay);
      } else {
        setError('Unable to load video. Please refresh the page.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoUrl();
  }, []);

  // Enhanced video error handling
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoElement = e.currentTarget;
    let errorMessage = 'Video loading failed';

    if (videoElement.error) {
      switch (videoElement.error.code) {
        case videoElement.error.MEDIA_ERR_ABORTED:
          errorMessage = 'Video loading was aborted';
          break;
        case videoElement.error.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error - video failed to load';
          break;
        case videoElement.error.MEDIA_ERR_DECODE:
          errorMessage = 'Video format or decoding error';
          break;
        case videoElement.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = 'Video format not supported';
          break;
        default:
          errorMessage = `Video error (code: ${videoElement.error.code})`;
      }
    }

    console.error('❌ Video loading error:', { error: e, videoUrl, errorMessage });

    if (retryCountRef.current < maxRetries) {
      console.log(`🔄 Retrying video load (attempt ${retryCountRef.current + 1})`);
      retryCountRef.current++;
      fetchVideoUrl(retryCountRef.current);
    } else {
      setError(`${errorMessage}. Please refresh the page.`);
    }
  };

  const handleVideoLoaded = () => {
    console.log('✅ Video loaded successfully:', videoUrl);
    setError(null);
    retryCountRef.current = 0; // Reset retry count on successful load
  };

  useEffect(() => {
    if (!videoUrl || isLoading || error) return;
    const interval = setInterval(() => {
      if (videoRef.current && videoRef.current.currentTime >= 187) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(err => console.log("Video play interrupted:", err));
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [videoUrl, isLoading, error]);

  return (
    <div className="relative w-full max-w-3xl lg:max-w-none mx-auto group">
      {/* Outer soft ambient sun glow */}
      <div 
        className="absolute -inset-1.5 rounded-[26px] opacity-75 blur-md transition duration-1000 group-hover:opacity-100 group-hover:duration-500"
        style={{
          background: 'radial-gradient(circle at center, rgba(20, 184, 166, 0.15) 0%, rgba(245, 158, 11, 0.03) 70%, transparent 100%)',
        }}
      ></div>

      {/* Frame container */}
      <div 
        className="relative w-full rounded-2xl border border-white/[0.08] px-3.5 pt-9 pb-9 bg-gradient-to-b from-[#0e1726] to-[#040c1e] shadow-2xl"
        style={{
          boxShadow: '0 30px 60px -15px rgba(3, 10, 22, 0.8), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}
      >
        {/* Top Left Badge - Assam down town University */}
        <div className="absolute top-2 left-3.5 z-20 flex items-center gap-2 px-3 py-0.5 bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-full text-[9px] font-bold text-white tracking-wider uppercase select-none">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
          </span>
          Assam down town University
        </div>

        {/* Inner bezel wrapper */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#030a16] border border-black/40">
          {isLoading || !videoUrl ? (
            <div className="w-full h-full flex items-center justify-center min-h-[200px]">
              <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 min-h-[200px]">
              <div className="text-red-400 mb-4">
                <PlayCircle className="w-12 h-12 mx-auto mb-2" />
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={() => fetchVideoUrl()}
                className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 hover:bg-amber-500/30 transition-colors text-sm"
              >
                Retry
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={videoUrl}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
              onLoadedData={handleVideoLoaded}
              onError={handleVideoError}
              key={videoUrl}
            />
          )}

          {/* Gradient Overlay for premium feel */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#030a16]/60 via-transparent to-transparent pointer-events-none"></div>
          <div className="absolute inset-0 ring-1 ring-inset ring-white/5 rounded-xl pointer-events-none"></div>
        </div>

        {/* Bottom Left Badge 1: Live Shuttle Stream */}
        <div className="absolute bottom-2.5 left-3.5 z-20 flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-950/80 backdrop-blur-md border border-teal-500/20 rounded-full text-[9px] font-bold text-teal-400 tracking-wider uppercase select-none">
          <span className="w-1 h-1 rounded-full bg-teal-400"></span>
          Live Shuttle Stream
        </div>

        {/* Bottom Left Badge 2: Secured SSL */}
        <div className="absolute bottom-2.5 left-[138px] z-20 flex items-center gap-1 px-2.5 py-0.5 bg-slate-950/65 backdrop-blur-md border border-white/5 rounded-full text-[9px] font-medium text-slate-300 tracking-wider uppercase select-none">
          <Shield className="w-2.5 h-2.5 text-slate-400" />
          Secured SSL
        </div>
      </div>
    </div>
  );
}

export default function PremiumLanding() {
  const { currentUser, userData, loading, needsApplication } = useAuth();
  const { appName } = useSystemConfig();
  const router = useRouter();
  const [landingConfig, setLandingConfig] = useState<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const busRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrollingDown, setIsScrollingDown] = useState(true);

  // References for Dice Sections DOM updates
  const section1Ref = useRef<HTMLDivElement>(null);
  const cube1Ref = useRef<HTMLDivElement>(null);
  const s1Text1Ref = useRef<HTMLDivElement>(null);
  const s1Text2Ref = useRef<HTMLDivElement>(null);
  const s1Dot1Ref = useRef<HTMLButtonElement>(null);
  const s1Dot2Ref = useRef<HTMLButtonElement>(null);

  const section2Ref = useRef<HTMLDivElement>(null);
  const cube2Ref = useRef<HTMLDivElement>(null);
  const s2Text1Ref = useRef<HTMLDivElement>(null);
  const s2Text2Ref = useRef<HTMLDivElement>(null);
  const s2Dot1Ref = useRef<HTMLButtonElement>(null);
  const s2Dot2Ref = useRef<HTMLButtonElement>(null);

  // Directly update DOM elements on scroll for high performance
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;

    const totalScrollable = scrollHeight - clientHeight;
    if (totalScrollable <= 0) return;

    const progress = scrollTop / totalScrollable;
    setScrollProgress(progress);

    const down = scrollTop >= lastScrollTop.current;
    lastScrollTop.current = scrollTop;
    setIsScrollingDown(down);

    // Update Bottom Bar Bus Tracker
    if (busRef.current) {
      // mathematically bounded bus movement (from 0 to 100% minus the bus width)
      busRef.current.style.left = `calc(${progress} * (100% - 24px))`;
      busRef.current.style.transform = `scaleX(${down ? 1 : -1})`;
    }

    // Update Dice Section 1 (Stages 1 and 2)
    if (section1Ref.current) {
      const rect = section1Ref.current.getBoundingClientRect();
      const sectionHeight = rect.height;
      const scrollable = sectionHeight - clientHeight;
      if (scrollable > 0) {
        const p = Math.max(0, Math.min(1, -rect.top / scrollable));
        
        // Cube horizontal rotation
        if (cube1Ref.current) {
          cube1Ref.current.style.transform = `rotateX(calc(12deg - ${p} * 24deg)) rotateY(calc(${p} * -90deg))`;
        }
        // Stage 1 content cross-fade
        if (s1Text1Ref.current) {
          const op = Math.max(0, Math.min(1, 1 - p * 2.5));
          s1Text1Ref.current.style.opacity = op.toString();
          s1Text1Ref.current.style.transform = `translateY(${-p * 20}px)`;
          s1Text1Ref.current.style.pointerEvents = op < 0.1 ? 'none' : 'auto';
        }
        // Stage 2 content cross-fade
        if (s1Text2Ref.current) {
          const op = Math.max(0, Math.min(1, (p - 0.4) * 2.5));
          s1Text2Ref.current.style.opacity = op.toString();
          s1Text2Ref.current.style.transform = `translateY(${(1 - p) * 20}px)`;
          s1Text2Ref.current.style.pointerEvents = op < 0.1 ? 'none' : 'auto';
        }
        // Active dot adjustments
        if (s1Dot1Ref.current && s1Dot2Ref.current) {
          if (p < 0.5) {
            s1Dot1Ref.current.style.width = '40px';
            s1Dot1Ref.current.style.backgroundColor = '#f59e0b';
            s1Dot2Ref.current.style.width = '8px';
            s1Dot2Ref.current.style.backgroundColor = '#475569';
          } else {
            s1Dot1Ref.current.style.width = '8px';
            s1Dot1Ref.current.style.backgroundColor = '#475569';
            s1Dot2Ref.current.style.width = '40px';
            s1Dot2Ref.current.style.backgroundColor = '#f59e0b';
          }
        }
      }
    }

    // Update Dice Section 2 (Stages 3 and 4)
    if (section2Ref.current) {
      const rect = section2Ref.current.getBoundingClientRect();
      const sectionHeight = rect.height;
      const scrollable = sectionHeight - clientHeight;
      if (scrollable > 0) {
        const p = Math.max(0, Math.min(1, -rect.top / scrollable));
        
        // Cube vertical rotation (rotates top face to front face)
        if (cube2Ref.current) {
          cube2Ref.current.style.transform = `rotateY(calc(-12deg + ${p} * 24deg)) rotateX(calc(-90deg + ${p} * 90deg))`;
        }
        // Stage 3 content cross-fade
        if (s2Text1Ref.current) {
          const op = Math.max(0, Math.min(1, 1 - p * 2.5));
          s2Text1Ref.current.style.opacity = op.toString();
          s2Text1Ref.current.style.transform = `translateY(${-p * 20}px)`;
          s2Text1Ref.current.style.pointerEvents = op < 0.1 ? 'none' : 'auto';
        }
        // Stage 4 content cross-fade
        if (s2Text2Ref.current) {
          const op = Math.max(0, Math.min(1, (p - 0.4) * 2.5));
          s2Text2Ref.current.style.opacity = op.toString();
          s2Text2Ref.current.style.transform = `translateY(${(1 - p) * 20}px)`;
          s2Text2Ref.current.style.pointerEvents = op < 0.1 ? 'none' : 'auto';
        }
        // Active dot adjustments
        if (s2Dot1Ref.current && s2Dot2Ref.current) {
          if (p < 0.5) {
            s2Dot1Ref.current.style.width = '40px';
            s2Dot1Ref.current.style.backgroundColor = '#f59e0b';
            s2Dot2Ref.current.style.width = '8px';
            s2Dot2Ref.current.style.backgroundColor = '#475569';
          } else {
            s2Dot1Ref.current.style.width = '8px';
            s2Dot1Ref.current.style.backgroundColor = '#475569';
            s2Dot2Ref.current.style.width = '40px';
            s2Dot2Ref.current.style.backgroundColor = '#f59e0b';
          }
        }
      }
    }
  };

  const scrollToStage1 = (stage: number) => {
    if (section1Ref.current && containerRef.current) {
      const container = containerRef.current;
      const sectionTop = section1Ref.current.offsetTop;
      container.scrollTo({
        top: sectionTop + stage * window.innerHeight,
        behavior: 'smooth'
      });
    }
  };

  const scrollToStage2 = (stage: number) => {
    if (section2Ref.current && containerRef.current) {
      const container = containerRef.current;
      const sectionTop = section2Ref.current.offsetTop;
      container.scrollTo({
        top: sectionTop + stage * window.innerHeight,
        behavior: 'smooth'
      });
    }
  };

  // Scroll reveal with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-active");
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    const elements = document.querySelectorAll(".reveal-on-scroll");
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  // Fetch landing config
  useEffect(() => {
    fetch('/api/settings/landing-config')
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch landing config: ${res.status}`);
        }
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new TypeError("Response is not JSON");
        }
        return res.json();
      })
      .then(data => {
        if (data && data.success) setLandingConfig(data.config);
      })
      .catch(err => {
        console.warn('Landing config fetch error:', err.message || err);
      });
  }, []);

  // Redirect logic if already authenticated
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
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-screen bg-[#030a16] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
          <p className="text-lg font-semibold text-slate-300">Loading AdtU ITMS...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="h-screen overflow-y-auto snap-y snap-mandatory bg-[#030a16] text-white overflow-x-hidden selection:bg-amber-500/30 selection:text-white scroll-smooth scrollbar-none relative"
    >
      {/* FIXED PAGE-WIDE BACKGROUND IMAGE */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none">
        <Image 
          src="/landing/hero.jpg" 
          alt="ADTU Campus background" 
          fill 
          priority 
          className="object-cover opacity-90 pointer-events-none select-none"
        />
        {/* Soft atmospheric overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030a16]/30 via-[#030a16]/65 to-[#030a16]" />
      </div>

      {/* Global CSS overrides and utility declarations */}
      <style jsx global>{`
        :root {
          --cube-z: 80px;
        }
        @media (min-width: 640px) {
          :root {
            --cube-z: 96px;
          }
        }
        @media (min-width: 768px) {
          :root {
            --cube-z: 112px;
          }
        }

        .reveal-on-scroll {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform, opacity;
        }

        .reveal-active {
          opacity: 1;
          transform: translateY(0);
        }

        .delay-100 { transition-delay: 100ms; }
        .delay-200 { transition-delay: 200ms; }
        .delay-300 { transition-delay: 300ms; }
        .delay-400 { transition-delay: 400ms; }

        @keyframes scroll-x {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-50% - 12px)); }
        }
        .animate-scroll-x {
          animation: scroll-x 40s linear infinite;
          width: max-content;
        }
        .animate-scroll-x:hover {
          animation-play-state: paused;
        }
        .mask-edges {
          mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .reveal-on-scroll {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>

      {/* 1. HERO SECTION */}
      <section className="relative h-screen snap-start snap-always flex items-center justify-center px-6 sm:px-12 lg:px-20 z-10 pt-10 pb-8 overflow-hidden bg-transparent">
        <div className="relative max-w-[94rem] mx-auto w-full flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12 items-center z-10 h-full justify-center">
          {/* Left Text */}
          <div className="lg:col-span-5 space-y-4 lg:space-y-6 text-left reveal-on-scroll pr-0 lg:pr-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-300 rounded-full text-[10px] md:text-xs font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></span>
              Assam down town University
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.15] text-white">
              Track Your ADTU Bus{" "}
              <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-teal-300 bg-clip-text text-transparent">
                Before You Leave Home
              </span>
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-xl font-medium">
              Experience a smarter, more organized campus commute. Access your digital bus pass, track bus activity, and manage your transport records from one student-friendly portal.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={handleSignIn}
                className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:scale-[1.01] cursor-pointer text-center text-sm shadow-lg"
              >
                Sign In with Google
              </button>
            </div>

            {/* Trust points */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-800/40 max-w-lg">
              {[
                { label: "Live shuttle track" },
                { label: "Digital QR pass" },
                { label: "Receipt access" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-slate-400 font-semibold leading-snug">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Media Panel (made a bit bigger with more padded frame stand) */}
          <div className="lg:col-span-7 w-full flex items-center justify-center p-2 lg:p-4 xl:p-6 bg-slate-950/20 rounded-3xl border border-white/5 backdrop-blur-[2px] reveal-on-scroll delay-100">
            <div className="w-full">
              <LandingVideo />
            </div>
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE ROTATING DICE SECTIONS */}
      <InteractiveDiceSection1 
        sectionRef={section1Ref}
        cubeRef={cube1Ref}
        text1Ref={s1Text1Ref}
        text2Ref={s1Text2Ref}
        dot1Ref={s1Dot1Ref}
        dot2Ref={s1Dot2Ref}
        scrollToStage={scrollToStage1}
      />
      
      <InteractiveDiceSection2 
        sectionRef={section2Ref}
        cubeRef={cube2Ref}
        text1Ref={s2Text1Ref}
        text2Ref={s2Text2Ref}
        dot1Ref={s2Dot1Ref}
        dot2Ref={s2Dot2Ref}
        scrollToStage={scrollToStage2}
      />

      {/* 3. LEARNING & COMMUTING CAROUSEL */}
      <LearningCarousel />

      {/* 4. REDESIGNED PORTAL ACCESS SECTION */}
      <section className="relative h-screen snap-start snap-always flex items-center justify-center px-4 sm:px-6 lg:px-8 z-10 overflow-hidden">
        {/* Background image for final CTA */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/landing/adtusw.jpg" 
            alt="Portal access background" 
            fill 
            className="object-cover object-left opacity-75 select-none pointer-events-none" 
          />
          <div className="absolute inset-0 bg-gradient-to-l from-[#030a16] via-[#030a16]/80 to-transparent" />
        </div>

        <div className="relative max-w-3xl mx-auto w-full z-10 reveal-on-scroll px-4">
          <div className="relative overflow-hidden bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] text-center group">
            
            {/* Absolute internal soft glow */}
            <div className="absolute -inset-24 rounded-full opacity-10 bg-radial-gradient from-teal-500 via-transparent to-transparent blur-3xl pointer-events-none group-hover:opacity-20 transition-opacity duration-1000" />
            
            <div className="relative z-10 space-y-6 max-w-xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-full text-[10px] font-bold uppercase tracking-widest">
                <Shield className="w-3 h-3" /> Secure SSO Authorization
              </span>
              
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Transit Access Portal
              </h2>
              
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium">
                Log in using your official Assam down town University credentials to unlock live routing, track bus coordinates, and manage digital student bus passes instantly.
              </p>

              <div className="pt-4 flex flex-col items-center justify-center space-y-3">
                <button
                  onClick={handleSignIn}
                  className="w-full max-w-sm px-6 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-base shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] cursor-pointer text-center flex items-center justify-center gap-3"
                >
                  <span>Sign In with Google</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Authorized @adtu.in domains only
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. FOOTER */}
      <Footer className="relative z-10 snap-start snap-always !border-white/5 !bg-[#030a16]" />

      {/* DYNAMIC ISLAND BUS TRACKER */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg h-14 bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-full flex items-center px-6 justify-between shadow-2xl select-none pointer-events-auto">
        <div className="flex flex-col justify-center text-left">
          <span className="text-[11px] font-black tracking-widest text-slate-300">HOME</span>
          <span className="text-[7px] font-bold text-slate-500 tracking-wider leading-none uppercase">Start</span>
        </div>

        <div className="flex-1 mx-4 relative h-6 flex items-center">
          <div className="absolute left-0 right-0 h-0.5 bg-slate-800/80 rounded-full" />
          <div 
            className="absolute left-0 h-0.5 bg-gradient-to-r from-amber-500 to-teal-400 rounded-full"
            style={{ width: `${scrollProgress * 100}%` }}
          />
          <div 
            ref={busRef}
            className="absolute w-8 h-6 flex items-center justify-center"
            style={{ 
              left: `calc(${scrollProgress} * (100% - 24px))`,
              transform: `scaleX(${isScrollingDown ? 1 : -1})`,
              transition: 'left 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <Bus className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-200 blur-[1px] opacity-80" />
          </div>
        </div>

        <div className="flex flex-col justify-center text-right">
          <span className="text-[11px] font-black tracking-widest text-teal-400">UNIVERSITY</span>
          <span className="text-[7px] font-bold text-slate-500 tracking-wider leading-none uppercase">AdtU Campus</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// SUB-COMPONENTS
// ------------------------------------------------------------------------------------------------

interface InteractiveDiceSectionProps {
  sectionRef: React.RefObject<HTMLDivElement | null>;
  cubeRef: React.RefObject<HTMLDivElement | null>;
  text1Ref: React.RefObject<HTMLDivElement | null>;
  text2Ref: React.RefObject<HTMLDivElement | null>;
  dot1Ref: React.RefObject<HTMLButtonElement | null>;
  dot2Ref: React.RefObject<HTMLButtonElement | null>;
  scrollToStage: (stage: number) => void;
}

function InteractiveDiceSection1({
  sectionRef,
  cubeRef,
  text1Ref,
  text2Ref,
  dot1Ref,
  dot2Ref,
  scrollToStage
}: InteractiveDiceSectionProps) {
  const steps = [
    {
      title: "Real-Time Tracking & Preparation",
      subtitle: "Stage 01 • Start your day with confidence",
      desc: "Check your assigned bus's active status and map coordinates before leaving home.",
      badge: "Real-time Fleet",
      badgeColor: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    },
    {
      title: "Digital Integration & Commute Safety",
      subtitle: "Stage 02 • Seamless campus boarding",
      desc: "Ditch physical passes and cash disputes. Display your verified digital QR bus pass on your device for immediate verification by drivers or coordinators upon boarding.",
      badge: "Smart Access",
      badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    },
  ];

  return (
    <div ref={sectionRef} className="relative w-full bg-transparent h-[200vh] border-t border-white/5">
      {/* Sticky Content Container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden z-10 flex items-center">
        {/* Background image (left to right visibility mask: dark on left, image visible on right) */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/landing/adtu1.jpg" 
            alt="ADTU real-time coordination background" 
            fill 
            className="object-cover object-right opacity-80 pointer-events-none select-none" 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#030a16] via-[#030a16]/65 to-transparent" />
        </div>

        <div className="relative max-w-[94rem] mx-auto px-6 sm:px-16 lg:px-24 w-full h-full flex flex-col md:flex-row items-center justify-between z-10">
          {/* Left Text Column */}
          <div className="w-full md:w-1/2 flex flex-col justify-center h-full relative pr-0 md:pr-12">
            <div className="relative h-[450px] w-full flex items-center">
              
              {/* Stage 1 Content */}
              <div ref={text1Ref} className="absolute inset-x-0 space-y-4 md:space-y-6 text-left transition-all duration-75">
                <span className="text-xs font-bold text-amber-400 tracking-widest uppercase block">
                  Platform Dynamics
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
                  Less guessing. <br />
                  <span className="bg-gradient-to-r from-amber-400 to-teal-400 bg-clip-text text-transparent">
                    More confidence.
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 border rounded-full text-xs font-bold uppercase tracking-wider ${steps[0].badgeColor}`}>
                    {steps[0].badge}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{steps[0].title}</h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium max-w-xl">
                  {steps[0].desc}
                </p>
                <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                  {steps[0].subtitle}
                </p>
              </div>

              {/* Stage 2 Content */}
              <div ref={text2Ref} className="absolute inset-x-0 space-y-4 md:space-y-6 text-left opacity-0 pointer-events-none transition-all duration-75">
                <span className="text-xs font-bold text-amber-400 tracking-widest uppercase block">
                  Platform Dynamics
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
                  Less guessing. <br />
                  <span className="bg-gradient-to-r from-amber-400 to-teal-400 bg-clip-text text-transparent">
                    More confidence.
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 border rounded-full text-xs font-bold uppercase tracking-wider ${steps[1].badgeColor}`}>
                    {steps[1].badge}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{steps[1].title}</h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium max-w-xl">
                  {steps[1].desc}
                </p>
                <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                  {steps[1].subtitle}
                </p>
              </div>

            </div>

            {/* Dots */}
            <div className="flex items-center gap-3 pt-6 border-t border-white/5 max-w-md mt-6">
              <button
                ref={dot1Ref}
                onClick={() => scrollToStage(0)}
                className="relative h-2 rounded-full transition-all duration-300 w-10 bg-amber-400"
                aria-label="Go to stage 1"
              />
              <button
                ref={dot2Ref}
                onClick={() => scrollToStage(1)}
                className="relative h-2 rounded-full transition-all duration-300 w-2 bg-slate-700"
                aria-label="Go to stage 2"
              />
            </div>
          </div>

          {/* Right Cube Column */}
          <div className="w-full md:w-1/2 flex items-center justify-center p-4 md:p-12">
            <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 flex items-center justify-center [perspective:1000px] select-none">
              
              {/* Backlight Glow */}
              <div className="absolute inset-0 rounded-full opacity-20 blur-3xl bg-radial-gradient from-amber-500/50 to-transparent pointer-events-none" />

              {/* 3D Cube */}
              <div 
                ref={cubeRef} 
                className="w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 relative [transform-style:preserve-3d] transition-transform duration-75"
                style={{
                  transform: 'rotateX(12deg) rotateY(0deg)',
                }}
              >
                {/* Face 1: Live Route Map (Front) */}
                <div 
                  className="absolute inset-0 w-full h-full bg-[#040c1e]/95 border border-teal-500/20 rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-2xl [backface-visibility:hidden] [transform:rotateY(0deg)_translateZ(var(--cube-z,80px))]"
                  style={{
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.6)'
                  }}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-[9px] md:text-[10px] font-mono text-teal-400 font-bold uppercase tracking-wider">Live Route Map</span>
                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex-1 py-3 flex flex-col justify-center gap-2">
                    <div className="relative h-20 bg-slate-950/60 rounded-xl border border-white/5 p-2 flex flex-col justify-between overflow-hidden">
                      <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-gradient-to-r from-teal-500/10 to-teal-500/80 -translate-y-1/2" />
                      <div className="flex justify-between relative z-10 text-[9px] font-semibold text-slate-400">
                        <span>Boragaon</span>
                        <span className="text-teal-300">Panikhaiti</span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] z-10 text-slate-300">
                        <span className="font-mono text-teal-400">Route #4 • Active</span>
                        <span className="px-1.5 py-0.5 bg-teal-500/10 rounded border border-teal-500/20 text-teal-400">ETA 8m</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-300 font-medium">
                    <Navigation className="w-3.5 h-3.5 text-teal-400" />
                    <span>Track active shuttle coordinates</span>
                  </div>
                </div>

                {/* Face 2: Smart Access Pass (Right Face) */}
                <div 
                  className="absolute inset-0 w-full h-full bg-[#040c1e]/95 border border-amber-500/20 rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-2xl [backface-visibility:hidden] [transform:rotateY(90deg)_translateZ(var(--cube-z,80px))]"
                  style={{
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.6)'
                  }}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-[9px] md:text-[10px] font-mono text-amber-300 font-bold uppercase tracking-wider">Secure Pass</span>
                    <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[7px] md:text-[8px] font-bold text-amber-300 uppercase">Verified</span>
                  </div>
                  <div className="flex-1 py-3 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-950/60 rounded-xl border border-white/5 flex flex-col items-center justify-center p-2 text-slate-500 font-mono">
                      <div className="w-12 h-12 border border-dashed border-amber-500/40 rounded flex items-center justify-center text-amber-400 font-bold text-[10px]">
                        QR CODE
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-300 font-medium">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tap to scan and verify boarding</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Snap Targets */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="h-screen snap-start snap-always" />
        <div className="h-screen snap-start snap-always" />
      </div>
    </div>
  );
}

function InteractiveDiceSection2({
  sectionRef,
  cubeRef,
  text1Ref,
  text2Ref,
  dot1Ref,
  dot2Ref,
  scrollToStage
}: InteractiveDiceSectionProps) {
  const steps = [
    {
      title: "Verified Receipts & Logs",
      subtitle: "Stage 03 • Secure management logs",
      desc: "Review your transport history, verified term payment receipts, and route logs. A transparent record-keeping system designed to support clean administrative transitions.",
      badge: "Growth & Safety",
      badgeColor: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    },
    {
      title: "Dynamic Swaps & Dispatching",
      subtitle: "Stage 04 • Scalable coordinate routing",
      desc: "Monitor dynamic dispatch updates, moderator schedule changes, and active shuttle route assignments. ITMS adapts dynamically to support expanding campus commuting populations.",
      badge: "Dynamic Networks",
      badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    },
  ];

  return (
    <div ref={sectionRef} className="relative w-full bg-transparent h-[200vh] border-t border-white/5">
      {/* Sticky Content Container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden z-10 flex items-center">
        {/* Background image (right to left visibility mask: dark on right, image visible on left) */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/landing/adtusw.jpg" 
            alt="ADTU verified records background" 
            fill 
            className="object-cover object-left opacity-80 pointer-events-none select-none" 
          />
          <div className="absolute inset-0 bg-gradient-to-l from-[#030a16] via-[#030a16]/65 to-transparent" />
        </div>

        <div className="relative max-w-[94rem] mx-auto px-6 sm:px-16 lg:px-24 w-full h-full flex flex-col md:flex-row items-center justify-between z-10">
          {/* Left Cube Column */}
          <div className="w-full md:w-1/2 flex items-center justify-center p-4 md:p-12 order-2 md:order-1">
            <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 flex items-center justify-center [perspective:1000px] select-none">
              
              {/* Backlight Glow */}
              <div className="absolute inset-0 rounded-full opacity-20 blur-3xl bg-radial-gradient from-teal-500/50 to-transparent pointer-events-none" />

              {/* 3D Cube */}
              <div 
                ref={cubeRef} 
                className="w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 relative [transform-style:preserve-3d] transition-transform duration-75"
                style={{
                  transform: 'rotateY(-12deg) rotateX(0deg)',
                }}
              >
                {/* Face 3: Commute History (Top Face) */}
                <div 
                  className="absolute inset-0 w-full h-full bg-[#040c1e]/95 border border-indigo-500/20 rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-2xl [backface-visibility:hidden] [transform:rotateX(90deg)_translateZ(var(--cube-z,80px))]"
                  style={{
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.6)'
                  }}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-[9px] md:text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider">Commute History</span>
                    <span className="text-[8px] md:text-[9px] text-slate-400 font-bold">ITMS Log</span>
                  </div>
                  <div className="flex-1 py-3 flex flex-col justify-center gap-2 text-[9px] md:text-[10px]">
                    <div className="p-2 bg-slate-950/60 rounded-xl border border-white/5 flex justify-between items-center text-slate-300 font-medium">
                      <span>Verified Spring Term</span>
                      <span className="text-teal-400 font-bold">₹7,500</span>
                    </div>
                    <div className="p-2 bg-slate-950/60 rounded-xl border border-white/5 flex justify-between items-center text-slate-300 font-medium">
                      <span>Assigned Route #4</span>
                      <span className="text-indigo-400 font-semibold">Active</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-300 font-medium">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Review receipt approval log</span>
                  </div>
                </div>

                {/* Face 4: Transit Operations (Front Face) */}
                <div 
                  className="absolute inset-0 w-full h-full bg-[#040c1e]/95 border border-orange-500/20 rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-2xl [backface-visibility:hidden] [transform:rotateX(0deg)_translateZ(var(--cube-z,80px))]"
                  style={{
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.6)'
                  }}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-[9px] md:text-[10px] font-mono text-orange-400 font-bold uppercase tracking-wider">Transit Operations</span>
                    <span className="text-[8px] md:text-[9px] text-slate-400 font-bold">Admin Stat</span>
                  </div>
                  <div className="flex-1 py-3 flex flex-col justify-center gap-2 text-[9px] md:text-[10px]">
                    <div className="p-2 bg-slate-950/60 rounded-xl border border-white/5 flex justify-between items-center text-slate-300 font-medium">
                      <span>Verified Route Loads</span>
                      <span className="text-teal-400 font-bold">98.4%</span>
                    </div>
                    <div className="p-2 bg-slate-950/60 rounded-xl border border-white/5 flex justify-between items-center text-slate-300 font-medium">
                      <span>Active Duty Swaps</span>
                      <span className="text-amber-400 font-semibold">0 Swaps</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-300 font-medium">
                    <Settings className="w-3.5 h-3.5 text-orange-400" />
                    <span>Review route reassignment status</span>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Right Text Column */}
          <div className="w-full md:w-1/2 flex flex-col justify-center h-full relative order-1 md:order-2 pl-0 md:pl-12">
            <div className="relative h-[450px] w-full flex items-center">
              
              {/* Stage 3 Content */}
              <div ref={text1Ref} className="absolute inset-x-0 space-y-4 md:space-y-6 text-left transition-all duration-75">
                <span className="text-xs font-bold text-amber-400 tracking-widest uppercase block">
                  Platform Dynamics
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
                  Less guessing. <br />
                  <span className="bg-gradient-to-r from-amber-400 to-teal-400 bg-clip-text text-transparent">
                    More confidence.
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 border rounded-full text-xs font-bold uppercase tracking-wider ${steps[0].badgeColor}`}>
                    {steps[0].badge}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{steps[0].title}</h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium max-w-xl">
                  {steps[0].desc}
                </p>
                <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                  {steps[0].subtitle}
                </p>
              </div>

              {/* Stage 4 Content */}
              <div ref={text2Ref} className="absolute inset-x-0 space-y-4 md:space-y-6 text-left opacity-0 pointer-events-none transition-all duration-75">
                <span className="text-xs font-bold text-amber-400 tracking-widest uppercase block">
                  Platform Dynamics
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
                  Less guessing. <br />
                  <span className="bg-gradient-to-r from-amber-400 to-teal-400 bg-clip-text text-transparent">
                    More confidence.
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 border rounded-full text-xs font-bold uppercase tracking-wider ${steps[1].badgeColor}`}>
                    {steps[1].badge}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{steps[1].title}</h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium max-w-xl">
                  {steps[1].desc}
                </p>
                <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                  {steps[1].subtitle}
                </p>
              </div>

            </div>

            {/* Dots */}
            <div className="flex items-center gap-3 pt-6 border-t border-white/5 max-w-md mt-6">
              <button
                ref={dot1Ref}
                onClick={() => scrollToStage(0)}
                className="relative h-2 rounded-full transition-all duration-300 w-10 bg-amber-400"
                aria-label="Go to stage 3"
              />
              <button
                ref={dot2Ref}
                onClick={() => scrollToStage(1)}
                className="relative h-2 rounded-full transition-all duration-300 w-2 bg-slate-700"
                aria-label="Go to stage 4"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Snap Targets */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="h-screen snap-start snap-always" />
        <div className="h-screen snap-start snap-always" />
      </div>
    </div>
  );
}

function LearningCarousel() {
  const slides = [
    {
      title: "1. Integrated Commute Planning",
      desc: "Aligning daily shuttle dispatch schedules with university lecture timings.",
      icon: <Clock className="w-6 h-6 text-teal-400" />,
      tag: "Academics First",
      colorClass: "border-teal-500/20 bg-gradient-to-br from-[#030d22]/80 to-[#010815]/90 hover:border-teal-400/40 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    },
    {
      title: "2. Eco-Friendly Routing",
      desc: "Optimizing active shuttle pathways across Guwahati checkpoints.",
      icon: <MapPin className="w-6 h-6 text-amber-400" />,
      tag: "Sustainability",
      colorClass: "border-amber-500/20 bg-gradient-to-br from-[#030d22]/80 to-[#010815]/90 hover:border-amber-400/40 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    },
    {
      title: "3. Safe Commuter Trust",
      desc: "Offering secure, digital receipts and real-time coordinator access.",
      icon: <Shield className="w-6 h-6 text-indigo-400" />,
      tag: "Family Comfort",
      colorClass: "border-indigo-500/20 bg-gradient-to-br from-[#030d22]/80 to-[#010815]/90 hover:border-indigo-400/40 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    },
    {
      title: "4. Priority Boarding Access",
      desc: "Skip manual checks and long queues with instant digital QR code verification.",
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
      tag: "Time Saving",
      colorClass: "border-emerald-500/20 bg-gradient-to-br from-[#030d22]/80 to-[#010815]/90 hover:border-emerald-400/40 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    },
    {
      title: "5. Real-Time ETA Alerts",
      desc: "Get notified before your shuttle arrives so you never miss your ride.",
      icon: <Bell className="w-6 h-6 text-orange-400" />,
      tag: "Smart Alerts",
      colorClass: "border-orange-500/20 bg-gradient-to-br from-[#030d22]/80 to-[#010815]/90 hover:border-orange-400/40 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    }
  ];

  // We duplicate slides to make a seamless infinite loop
  const duplicatedSlides = [...slides, ...slides];

  return (
    <div className="relative w-full bg-transparent h-screen snap-start snap-always flex flex-col justify-center py-12 border-t border-white/5 overflow-hidden">
      {/* Background image for Carousel */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/landing/adtu2.jpg" 
          alt="ADTU journey background" 
          fill 
          className="object-cover object-left opacity-70 pointer-events-none select-none" 
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#030a16] via-[#030a16]/65 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 w-full z-10 mb-8 sm:mb-12">
        <div className="space-y-2">
          <span className="text-xs font-bold text-teal-400 tracking-widest uppercase block">
            Gradual Progress
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Learning & Commuting Journey
          </h2>
        </div>
      </div>

      {/* Infinite Carousel Container */}
      <div className="w-full overflow-hidden z-10 relative">
        {/* Soft edge masks for blending */}
        <div className="absolute inset-y-0 left-0 w-8 md:w-32 bg-gradient-to-r from-[#030a16] to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-8 md:w-32 bg-gradient-to-l from-[#030a16] to-transparent z-20 pointer-events-none" />

        <div className="flex w-max animate-infinite-scroll hover:[animation-play-state:paused]">
          {duplicatedSlides.map((slide, idx) => (
            <div 
              key={idx} 
              className={`w-[280px] sm:w-[320px] md:w-[380px] shrink-0 mx-3 md:mx-4 border rounded-2xl p-6 md:p-8 transition-all duration-300 hover:-translate-y-2 ${slide.colorClass}`}
            >
              <div className="mb-4">{slide.icon}</div>
              <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-bold text-slate-300 uppercase tracking-wider mb-3 inline-block">
                {slide.tag}
              </span>
              <h3 className="text-lg md:text-xl font-bold mb-2 text-white">{slide.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{slide.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes infinite-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-infinite-scroll {
          animation: infinite-scroll 40s linear infinite;
        }
      `}</style>
    </div>
  );
}
