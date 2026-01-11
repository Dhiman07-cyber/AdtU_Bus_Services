"use client";

import { useRouter } from "next/navigation";
import { 
  MapPin, Bell, Bus, Users, Clock, Shield, 
  Smartphone, Navigation, CheckCircle2, ArrowRight 
} from "lucide-react";

export default function HowItWorksPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0E0F12] text-white">
      {/* Hero Section */}
      <section className="relative py-12 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6 overflow-hidden">
        {/* Enhanced Background Glow */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-purple-500/15 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          <style jsx>{`
            @keyframes gradient-shift {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
            .animate-gradient {
              animation: gradient-shift 1.5s ease infinite;
            }
          `}</style>
          
          <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 border border-blue-400/40 rounded-full backdrop-blur-md shadow-lg shadow-blue-500/20 animate-gradient bg-[length:200%_auto] mb-4 sm:mb-6">
            <span className="text-xs sm:text-sm font-bold text-blue-300 tracking-wide">💡 HOW IT WORKS</span>
          </div>
          
          <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight">
            Simple, Smart, & Seamless
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              Campus Transportation
            </span>
          </h1>
          
          <p className="text-xs sm:text-sm md:text-lg lg:text-xl text-[#B0B3B8] max-w-3xl mx-auto mb-6 sm:mb-8 px-2">
            Track your bus in real-time, get instant notifications, and manage your campus transportation all in one place.
          </p>

          <button
            onClick={() => router.push("/")}
            className="px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm md:text-base hover:bg-white/10 transition-all duration-300 backdrop-blur-sm"
          >
            ← Back to Home
          </button>
        </div>
      </section>

      {/* How It Works - Timeline */}
      <section className="relative py-8 sm:py-12 md:py-16 px-3 sm:px-4 md:px-6 bg-[#12141A]/50">
        {/* Background Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15),transparent_60%)]"></div>
        
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 border border-blue-400/40 rounded-full backdrop-blur-md shadow-lg shadow-blue-500/20 animate-gradient-fast bg-[length:200%_auto] mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-bold text-blue-300 tracking-wide">⚡ HOW IT WORKS</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold mb-2 sm:mb-3">
              Simple 3-Step Process
            </h2>
            <p className="text-sm sm:text-base text-[#B0B3B8] max-w-2xl mx-auto">
              Get started in minutes - for both students and drivers
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-green-500"></div>
            
            <div className="space-y-8 sm:space-y-10">
              {[
                {
                  number: "01",
                  title: "Sign In & Authenticate",
                  desc: "Login securely with your Google account. Students verify enrollment ID, drivers get instant access to their dashboard.",
                  icon: "🔐",
                  color: "from-blue-500 to-cyan-500"
                },
                {
                  number: "02",
                  title: "Track in Real-Time",
                  desc: "Students see live bus location on map with ETA. Drivers start trips with one tap and navigate optimized routes.",
                  icon: "🚌",
                  color: "from-purple-500 to-pink-500"
                },
                {
                  number: "03",
                  title: "Stay Informed",
                  desc: "Instant push notifications for trip updates, delays, and arrival alerts. Never miss your bus again.",
                  icon: "📱",
                  color: "from-green-500 to-emerald-500"
                }
              ].map((step, idx) => (
                <div key={idx} className="relative pl-16 sm:pl-20 md:pl-24">
                  {/* Number Badge */}
                  <div className={`absolute left-0 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg text-white font-bold text-lg sm:text-xl`}>
                    {step.number}
                  </div>
                  
                  {/* Content */}
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/8 transition-all duration-300">
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-2xl sm:text-3xl">{step.icon}</span>
                      <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white">{step.title}</h3>
                    </div>
                    <p className="text-sm sm:text-base text-[#B0B3B8] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Key MVP Features */}
      <section className="relative py-8 sm:py-12 md:py-16 px-3 sm:px-4 md:px-6">
        {/* Background Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.15),transparent_60%)]"></div>
        
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 border border-purple-400/40 rounded-full backdrop-blur-md shadow-lg shadow-purple-500/20 animate-gradient-fast bg-[length:200%_auto] mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-bold text-purple-300 tracking-wide">🚀 KEY FEATURES</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold mb-2 sm:mb-3">
              Built for Performance & Scale
            </h2>
            <p className="text-sm sm:text-base text-[#B0B3B8] max-w-2xl mx-auto">
              Enterprise-grade features that make campus transportation seamless
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {[
              {
                title: "Real-Time GPS Tracking",
                desc: "Sub-100ms latency ensures students see exactly where their bus is. Firebase Realtime Database powers instant location updates across all devices simultaneously.",
                icon: MapPin,
                gradient: "from-blue-500 to-cyan-500",
                stats: "<100ms latency"
              },
              {
                title: "Smart Notifications",
                desc: "FCM push notifications alert students when buses start trips, approach stops, or experience delays. Drivers get pickup alerts and emergency notifications instantly.",
                icon: Bell,
                gradient: "from-green-500 to-emerald-500",
                stats: "Instant delivery"
              },
              {
                title: "Role-Based Dashboards",
                desc: "Students track buses and manage passes. Drivers navigate routes and log trips. Admins monitor fleet performance and analyze usage patterns - all with customized interfaces.",
                icon: Users,
                gradient: "from-purple-500 to-pink-500",
                stats: "3 user roles"
              },
              {
                title: "Secure Authentication",
                desc: "Firebase Authentication with Google Sign-In ensures secure access. Students verify enrollment IDs, while drivers get pre-approved dashboard access with encrypted credentials.",
                icon: "🔐",
                gradient: "from-orange-500 to-red-500",
                stats: "100% secure"
              }
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="group relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 sm:p-6 hover:bg-white/8 hover:scale-105 transition-all duration-300">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg`}>
                      {typeof Icon === 'string' ? (
                        <span className="text-2xl">{Icon}</span>
                      ) : (
                        <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-white mb-1">{feature.title}</h3>
                      <div className={`inline-block px-2 py-0.5 rounded-full bg-gradient-to-r ${feature.gradient} bg-opacity-20 text-xs font-semibold text-white`}>
                        {feature.stats}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm sm:text-base text-[#B0B3B8] leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Advanced Production Features */}
      <section className="relative py-8 sm:py-12 md:py-16 px-3 sm:px-4 md:px-6 bg-[#12141A]/50">
        {/* Background Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15),transparent_60%)]"></div>
        
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-block px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 border border-emerald-400/40 rounded-full backdrop-blur-md shadow-lg shadow-emerald-500/20 animate-gradient-fast bg-[length:200%_auto] mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-bold text-emerald-300 tracking-wide">🎯 ADVANCED MVP FEATURES</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-bold mb-2 sm:mb-3">
              Production-Ready Advanced Features
            </h2>
            <p className="text-sm sm:text-base text-[#B0B3B8] max-w-2xl mx-auto">
              Enterprise-grade functionality built for scale and reliability
            </p>
          </div>

          {/* Feature Grid - 3 Columns */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              {
                title: "QR Code Boarding",
                desc: "Secure QR code generation with token validation, auto-expiry, and real-time boarding verification for contactless attendance",
                icon: "🎫",
                gradient: "from-emerald-500 to-cyan-500",
                stats: "Token-based"
              },
              {
                title: "Payment Integration",
                desc: "Complete Razorpay gateway with online/offline modes, automatic renewal system, and comprehensive transaction history",
                icon: "💳",
                gradient: "from-blue-500 to-indigo-500",
                stats: "Multi-mode"
              },
              {
                title: "Driver Swap System",
                desc: "Flexible driver/bus swapping with customizable time periods, conflict prevention, and automatic assignment reversion",
                icon: "🔄",
                gradient: "from-purple-500 to-pink-500",
                stats: "Conflict-free"
              },
              {
                title: "Uber-like Waiting Flags",
                desc: "Real-time waiting status with GPS location sharing, instant driver acknowledgment, and distance-aware notifications",
                icon: "🚩",
                gradient: "from-orange-500 to-amber-500",
                stats: "GPS-enabled"
              },
              {
                title: "Role-Based System",
                desc: "Granular permission system for Admin, Moderator, Driver, and Student roles with secure authentication and access control",
                icon: "👥",
                gradient: "from-rose-500 to-pink-500",
                stats: "4 User Roles"
              },
              {
                title: "Analytics Dashboard",
                desc: "Comprehensive dashboards with trip history, real-time metrics, attendance tracking, and performance analytics",
                icon: "📊",
                gradient: "from-cyan-500 to-blue-500",
                stats: "Real-time"
              }
            ].map((feature, idx) => (
              <div key={idx} className="group relative bg-gradient-to-br from-white/5 to-white/2 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 hover:bg-white/8 hover:scale-105 transition-all duration-300 hover:shadow-xl">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg`}>
                    <span className="text-2xl sm:text-3xl">{feature.icon}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1">{feature.title}</h3>
                    <div className={`inline-block px-2 py-0.5 rounded-full bg-gradient-to-r ${feature.gradient} bg-opacity-20 text-xs font-semibold text-white`}>
                      {feature.stats}
                    </div>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-[#B0B3B8] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-12 sm:py-16 md:py-24 px-3 sm:px-4 md:px-6">
        {/* Enhanced Background Glow */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/15 rounded-full blur-3xl"></div>
        </div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 sm:mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xs sm:text-sm md:text-lg text-[#B0B3B8] mb-6 sm:mb-8 px-2">
            Join hundreds of students and drivers using our platform for seamless campus transportation
          </p>
          <button
            onClick={() => router.push("/login")}
            className="group px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base md:text-lg hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] transition-all duration-300 hover:scale-105 inline-flex items-center gap-2"
          >
            Sign In with Google
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>
    </div>
  );
}
