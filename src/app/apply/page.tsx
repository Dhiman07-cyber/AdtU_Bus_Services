"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  CheckCircle,
  Shield,
  CreditCard,
  UserCheck,
  Clock,
  Loader2,
  ArrowRight,
  MapPin,
  Users,
  TrendingUp,
  Award,
  Sparkles,
  Timer,
  Calendar,
  Phone,
  Mail,
  HelpCircle,
  Check,
  Zap,
  Star,
  Rocket,
  AlertCircle,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function ApplyLandingPage() {
  const { currentUser, userData, loading, needsApplication } = useAuth();
  const router = useRouter();
  const [checkingApplication, setCheckingApplication] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [existingApplication, setExistingApplication] = useState<any>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/settings/deadline-config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
        }
      } catch (e) {
        console.error('Error fetching dynamic config:', e);
      }
    }
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!loading) {
      // If user already has a profile, redirect to dashboard
      if (userData && userData.role) {
        router.push(`/${userData.role}`);
        return;
      }

      /* 
      // Check if there's a pending application
      if (currentUser) {
        checkPendingApplication();
      }
      */
    }
  }, [loading, userData, currentUser, router]);

  const checkPendingApplication = async () => {
    try {
      // Check if user has a pending application
      const response = await fetch('/api/applications/check', {
        headers: {
          'Authorization': `Bearer ${await currentUser?.getIdToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasApplication) {
          setExistingApplication(data.application || { status: 'submitted' });
          setCheckingApplication(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking application:', error);
    } finally {
      setCheckingApplication(false);
    }
  };

  if (loading || checkingApplication) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#020817]">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse"></div>
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 relative z-10 mx-auto" />
          </div>
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Case: Application Under Review
  if (false && existingApplication) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/20">
        <Card className="w-full max-w-lg shadow-2xl border-indigo-100 dark:border-indigo-900/50 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

          <CardHeader className="text-center pt-8 pb-2">
            <div className="mx-auto mb-4 relative">
              <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full"></div>
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-full flex items-center justify-center relative z-10 mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 animate-pulse" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Your application is successfully submitted
            </CardTitle>
            <CardDescription className="text-base mt-2 max-w-sm mx-auto">
              Your application is currently under review by our administration team.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                <p className="font-semibold mb-1">What's Next?</p>
                <p>As soon as it is approved, you can directly access your dashboard. This process typically takes <span className="font-bold">2-3 business days</span>.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-500 dark:text-gray-400">Application ID</span>
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                  {existingApplication.id || existingApplication.applicationId || 'PENDING'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800">
                  Pending Review
                </Badge>
              </div>
            </div>

            <Button
              className="w-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700"
              onClick={() => window.location.reload()}
            >
              <Loader2 className="w-4 h-4 mr-2" />
              Check Status
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/20">
        <Card className="w-full max-w-md animate-fade-in shadow-2xl border-2 border-blue-200 dark:border-blue-800">
          <CardHeader className="text-center pb-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 mx-auto mb-3 sm:mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-bounce-in">
              <Shield className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-white" />
            </div>
            <CardTitle className="text-lg sm:text-xl md:text-2xl">Sign In Required</CardTitle>
            <CardDescription className="text-xs sm:text-sm md:text-base mt-2">
              Please sign in with your institutional Google account to apply for bus services.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 h-12 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                Sign In with Google
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-950 dark:via-slate-900 dark:to-indigo-950 relative ">
      {/* Premium Animated Background with Grid */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Gradient Orbs */}
        <div className="absolute top-20 -left-20 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-1/3 -right-20 w-[600px] h-[600px] bg-gradient-to-bl from-purple-500/20 to-pink-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 left-1/4 w-80 h-80 bg-gradient-to-tr from-indigo-500/20 to-blue-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="relative z-10 pt-16 sm:pt-20 pb-6 sm:pb-8 md:pb-12 px-3 sm:px-4 md:px-6 lg:px-8 space-y-6 sm:space-y-8 md:space-y-10">
        {/* Premium Hero Section */}
        <div className="text-center space-y-3 sm:space-y-4 md:space-y-6 animate-fade-in max-w-6xl mx-auto mt-10">
          {/* Premium Badge */}
          <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-blue-200/50 dark:border-blue-700/50 rounded-full shadow-lg animate-slide-in-up">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            <Rocket className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <span className="text-[10px] sm:text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Official ADTU Transportation Platform
            </span>
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          </div>

          {/* Main Heading with Premium Typography */}
          <div className="space-y-2 sm:space-y-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black animate-slide-in-up tracking-tight" style={{ animationDelay: '0.1s' }}>
              <span className="block bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent leading-tight">
                {config?.landingPage?.heroTitle ? config.landingPage.heroTitle.split(' ').slice(0, 2).join(' ') : "Welcome to"}
              </span>
              <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent leading-tight">
                {config?.landingPage?.heroTitle ? config.landingPage.heroTitle.split(' ').slice(2).join(' ') : "ADTU Bus Services"}
              </span>
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-gray-700 dark:text-gray-300 max-w-3xl mx-auto leading-snug font-medium animate-slide-in-up px-2" style={{ animationDelay: '0.2s' }}>
              {config?.landingPage?.heroSubtitle || (
                <>Experience <span className="text-blue-600 dark:text-blue-400 font-bold">reliable</span>, <span className="text-purple-600 dark:text-purple-400 font-bold">safe</span>, and <span className="text-indigo-600 dark:text-indigo-400 font-bold">convenient</span> transportation</>
              )}
            </p>

            <p className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-400 max-w-xl mx-auto animate-slide-in-up px-2" style={{ animationDelay: '0.25s' }}>
              Your journey to seamless campus connectivity starts here ✨
            </p>
          </div>

          {/* Premium CTA Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-3 animate-slide-in-up" style={{ animationDelay: '0.3s' }}>
            <Link href="/apply/form">
              <Button size="default" className="group relative px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 text-xs sm:text-sm md:text-base font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 shadow-xl hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-105 overflow-hidden w-full sm:w-auto">
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>

                <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                  <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:rotate-12 transition-transform" />
                  Start Your Application
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-2 transition-transform" />
                </span>
              </Button>
            </Link>

            <Link href="/contact">
              <Button size="default" variant="outline" className="group px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 text-xs sm:text-sm md:text-base font-semibold border-2 border-gray-300 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white/50 dark:bg-gray-100 text-black backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 w-full sm:w-auto">
                <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 group-hover:rotate-12 transition-transform" />
                Contact Support
              </Button>
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 animate-slide-in-up" style={{ animationDelay: '0.35s' }}>
            <div className="flex items-center gap-1">
              <Check className="h-3 w-3 text-green-500" />
              <span>Verified Platform</span>
            </div>
            <div className="flex items-center gap-1">
              <Check className="h-3 w-3 text-green-500" />
              <span>Secure Application</span>
            </div>
            <div className="flex items-center gap-1">
              <Check className="h-3 w-3 text-green-500" />
              <span>24/7 Support</span>
            </div>
          </div>
        </div>

        {/* Premium Statistics Section with Glassmorphism */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 animate-slide-in-up" style={{ animationDelay: '0.4s' }}>
            {(config?.statistics?.items || [
              { icon: "Users", value: "200+", label: "Active Students", color: "blue", gradient: "from-blue-500 to-cyan-500" },
              { icon: "MapPin", value: "50+", label: "Routes Covered", color: "purple", gradient: "from-purple-500 to-pink-500" },
              { icon: "Award", value: "98%", label: "Satisfaction Rate", color: "green", gradient: "from-green-500 to-emerald-500" },
              { icon: "Zap", value: "24/7", label: "Real-time Tracking", color: "orange", gradient: "from-orange-500 to-yellow-500" }
            ]).map((stat: any, index: number) => {
              const StatIcon = ({
                Users,
                MapPin,
                Award,
                Zap,
                TrendingUp
              } as any)[stat.icon] || Sparkles;

              return (
                <Card key={index} className="group relative overflow-hidden bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-all duration-300 hover:scale-105 hover:shadow-lg">
                  {/* Gradient Background on Hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>

                  <CardContent className="p-3 sm:p-4 md:p-5 relative z-10 text-center">
                    {/* Icon with Gradient Ring */}
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2">
                      <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} rounded-xl blur-lg opacity-50 group-hover:opacity-100 transition-opacity duration-300`}></div>
                      <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-300`}>
                        <StatIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      </div>
                    </div>

                    {/* Value with Premium Gradient */}
                    <div className={`text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-br ${stat.gradient} bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform duration-300`}>
                      {stat.value}
                    </div>

                    {/* Label */}
                    <div className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 font-semibold uppercase tracking-wide leading-tight">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Premium Features Grid */}
        <div className="space-y-4 sm:space-y-6 animate-slide-in-up" style={{ animationDelay: '0.5s' }}>
          <div className="text-center">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Why Choose Our Service?
              </span>
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-2">
              Experience the most reliable and secure bus transportation service on campus
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 sm:gap-5">
            {[
              {
                icon: Shield,
                title: "Secure & Verified",
                description: "In-person verification by bus office staff ensures maximum security and prevents fraud. Your safety is our top priority.",
                gradient: "from-blue-500 to-cyan-500",
                bgGradient: "from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30",
                badge: "Verified"
              },
              {
                icon: CreditCard,
                title: "Flexible Payment",
                description: "Choose from 1-4 year plans with multiple payment options. Pay offline at the bus office or online via UPI/bank transfer.",
                gradient: "from-purple-500 to-pink-500",
                bgGradient: "from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30",
                badge: "Flexible"
              },
              {
                icon: Clock,
                title: "Quick & Easy",
                description: "Apply online in minutes. Get verified and approved within 2-3 business days. Fast-track your journey to convenience.",
                gradient: "from-green-500 to-teal-500",
                bgGradient: "from-green-50 to-teal-50 dark:from-green-950/30 dark:to-teal-950/30",
                badge: "Fast"
              }
            ].map((feature, index) => (
              <Card key={index} className={`group relative overflow-hidden border border-gray-200 dark:border-gray-800 hover:border-transparent transition-all duration-300 animate-fade-in bg-gradient-to-br ${feature.bgGradient}`} style={{ animationDelay: `${0.6 + index * 0.1}s` }}>
                {/* Stronger gradient on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.bgGradient} opacity-0 group-hover:opacity-80 transition-opacity duration-300`}></div>
                {/* Glossy shine effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50"></div>
                <CardContent className="p-4 sm:p-5 relative z-10">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                      <feature.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r ${feature.gradient} text-white shadow-md`}>
                      {feature.badge}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold mb-2 text-gray-900 dark:text-white group-hover:scale-105 transition-transform duration-300">{feature.title}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-snug">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Premium Step-by-Step Process */}
        <div className="animate-slide-in-up" style={{ animationDelay: '0.8s' }}>
          <Card className="border border-white/5 shadow-2xl bg-[#12131A]/60 backdrop-blur-xl overflow-hidden relative group">
            {/* Subtle background glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>

            <CardHeader className="text-center pb-8 pt-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-4">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <span className="text-[10px] sm:text-xs font-bold text-indigo-300 uppercase tracking-widest">The Experience</span>
              </div>
              <CardTitle className="text-2xl sm:text-3xl md:text-4xl font-black mb-3">
                <span className="bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                  Application Journey
                </span>
              </CardTitle>
              <CardDescription className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto px-4">
                Five intuitive steps to secure your premium campus transportation access
              </CardDescription>
            </CardHeader>

            <CardContent className="px-4 sm:px-8 md:px-12 pb-12 relative">
              {/* Central vertical line for the whole section */}
              <div className="absolute left-[31px] sm:left-[39px] top-0 bottom-12 w-[2px] bg-gradient-to-b from-indigo-500/50 via-purple-500/50 to-transparent"></div>

              <div className="space-y-10">
                {(config?.applicationProcess?.steps || [
                  { num: 1, title: "Fill Application Form", desc: "Provide your personal details, academic info, route preferences, and upload payment receipt.", icon: "FileText", delay: '0.9s', color: 'indigo' },
                  { num: 2, title: "Payment & Evidence", desc: "Pay fees at Bus Office (cash/UPI/bank). Upload receipt or mark offline payment.", icon: "CreditCard", delay: '1.0s', color: 'blue' },
                  { num: 3, title: "Moderator Verification", desc: "Choose a moderator from the list. Visit bus office with receipt to get 6-digit code.", icon: "UserCheck", delay: '1.1s', color: 'purple' },
                  { num: 4, title: "Enter Verification Code", desc: "Enter the 6-digit code to verify. Submit button becomes active after verification.", icon: "Shield", delay: '1.2s', color: 'cyan' },
                  { num: 5, title: "Admin Approval", desc: "Submit verified application. Admin reviews within 2-3 business days. Get instant notification!", icon: "CheckCircle", delay: '1.3s', color: 'emerald' }
                ]).map((step: any, index: number) => {
                  const StepIcon = ({
                    FileText,
                    CreditCard,
                    UserCheck,
                    Shield,
                    CheckCircle
                  } as any)[step.icon] || Sparkles;

                  return (
                    <div key={step.num || index} className="flex gap-6 sm:gap-10 group animate-fade-in relative z-10" style={{ animationDelay: step.delay || `${0.9 + index * 0.1}s` }}>
                      {/* Step Indicator Column */}
                      <div className="relative flex-shrink-0 flex flex-col items-center">
                        <div className={cn(
                          "w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl transition-all duration-500",
                          "bg-[#1A1B23]/80 border-2 border-white/5 backdrop-blur-md",
                          "group-hover:border-indigo-500/50 group-hover:bg-[#1A1B23] group-hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]"
                        )}>
                          <span className="text-xl sm:text-2xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent group-hover:from-indigo-300 group-hover:to-white transition-all duration-500">
                            {step.num}
                          </span>

                          {/* Status ring (only for last step or current focus) */}
                          {step.num === 5 && (
                            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/20 animate-pulse"></div>
                          )}
                        </div>
                      </div>

                      {/* Content Column */}
                      <div className="flex-1 min-w-0 pt-1 sm:pt-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
                            "bg-white/5 border border-white/10 group-hover:scale-110",
                            (step.color === 'indigo' || step.num === 1) && "group-hover:bg-indigo-500/20 group-hover:border-indigo-500/50",
                            (step.color === 'blue' || step.num === 2) && "group-hover:bg-blue-500/20 group-hover:border-blue-500/50",
                            (step.color === 'purple' || step.num === 3) && "group-hover:bg-purple-500/20 group-hover:border-purple-500/50",
                            (step.color === 'cyan' || step.num === 4) && "group-hover:bg-cyan-500/20 group-hover:border-cyan-500/50",
                            (step.color === 'emerald' || step.num === 5) && "group-hover:bg-emerald-500/20 group-hover:border-emerald-500/50"
                          )}>
                            <StepIcon className={cn(
                              "h-4 w-4 text-zinc-400 transition-colors duration-300",
                              "group-hover:text-white"
                            )} />
                          </div>
                          <h3 className="text-lg sm:text-xl font-bold text-white group-hover:translate-x-1 transition-transform duration-300">
                            {step.title}
                          </h3>
                        </div>
                        <p className="text-sm sm:text-base text-zinc-400 dark:text-zinc-500 leading-relaxed max-w-2xl">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Important Notes with Enhanced Design */}
        <Card className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-yellow-950/30 border border-amber-300 dark:border-amber-700 shadow-lg animate-slide-in-up" style={{ animationDelay: '1.4s' }}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg animate-pulse flex-shrink-0">
                <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <CardTitle className="text-base sm:text-lg md:text-xl font-bold text-amber-900 dark:text-amber-100">Important Information</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm text-amber-800 dark:text-amber-200 px-2">
              Please read these important details before starting your application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3 text-amber-900 dark:text-amber-200">
            {(config?.applicationProcess?.importantNotes || [
              { icon: "CreditCard", text: "Offline Payment: Currently, all payments must be made at the {officeName} for verification purposes." },
              { icon: "Shield", text: "Verification Required: You cannot submit the application without moderator verification." },
              { icon: "Calendar", text: "Session Validity: Bus passes are valid for full academic years (July to July)." },
              { icon: "CheckCircle", text: "Renewal Reminders: You'll receive automatic reminders in June before your pass expires." },
              { icon: "Clock", text: "Processing Time: Applications are typically processed within 2-3 business days after submission." }
            ]).map((note: any, index: number) => {
              const NoteIcon = ({
                CreditCard,
                Shield,
                Calendar,
                CheckCircle,
                Clock,
                AlertCircle
              } as any)[note.icon] || Info;

              const officeName = config?.contactInfo?.officeName || 'Bus Office';
              const displayText = note.text.replace('{officeName}', officeName);

              return (
                <div key={index} className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white/50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 hover:bg-white/70 dark:hover:bg-amber-900/40 transition-all duration-300">
                  <NoteIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-700 dark:text-amber-300 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] sm:text-xs font-medium leading-snug">{displayText}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Premium CTA Section */}
        <div className="text-center space-y-4 animate-slide-in-up" style={{ animationDelay: '1.5s' }}>
          <Card className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-6 sm:p-8 md:p-10 rounded-2xl shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="absolute top-0 left-0 w-full h-full opacity-10">
              <div className="absolute top-10 left-10 w-48 h-48 bg-white rounded-full blur-3xl"></div>
              <div className="absolute bottom-10 right-10 w-64 h-64 bg-white rounded-full blur-3xl"></div>
            </div>
            <div className="relative z-10">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">
                {config?.landingPage?.ctaTitle || "Ready to Start Your Journey?"}
              </h2>
              <p className="text-sm sm:text-base text-white/90 mb-5 max-w-xl mx-auto px-2">
                {config?.landingPage?.ctaSubtitle || "Join thousands of students who trust our reliable transportation service. Apply now and experience seamless connectivity!"}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Link href="/apply/form">
                  <Button size="default" className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold bg-white text-blue-600 hover:bg-gray-100 shadow-xl transform hover:scale-105 transition-all duration-300 w-full sm:w-auto">
                    <FileText className="h-4 w-4 mr-2" />
                    Start Application Now
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="default" variant="outline" className="px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-semibold bg-transparent border-2 border-white text-white hover:bg-white/10 w-full sm:w-auto">
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Support
                  </Button>
                </Link>
              </div>
              <p className="text-white/70 text-[10px] sm:text-xs mt-4 flex items-center justify-center gap-1.5">
                <Clock className="h-3 w-3" />
                Average completion time: 10-15 minutes
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
