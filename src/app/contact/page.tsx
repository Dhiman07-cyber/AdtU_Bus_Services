"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, Clock, MapPin, Headphones, MessageCircle, Sparkles, Loader2 } from 'lucide-react';
import ApplyFormNavbar from '@/components/ApplyFormNavbar';

export default function ContactPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05060e]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
          <p className="text-zinc-400 font-medium text-sm">Loading contact details...</p>
        </div>
      </div>
    );
  }

  const contactData = {
    title: config?.landingPage?.contactTitle || "Contact & Support",
    subtitle: config?.landingPage?.contactSubtitle || "Get in touch with our transport support team. We're here to help with all your transportation needs.",
    content: {
      support_email: config?.contactInfo?.email || "transport-support@adtu.edu.in",
      phone: config?.contactInfo?.phone || "+91 93657 71454",
      office_hours: config?.contactInfo?.officeHours || "Mon–Fri, 09:00–17:00 IST",
      address: config?.contactInfo?.address || "ADTU Campus, Sankar Madhab Path, Panikhaiti, Guwahati, Assam 781026"
    }
  };

  return (
    <div className="min-h-screen bg-[#05060e] dark:bg-[#05060e] overflow-x-hidden relative ">
      <ApplyFormNavbar />
      {/* Animated Background Decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-60 right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-40 left-1/3 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-[70rem] mx-auto px-4 sm:px-6 pt-28 sm:pt-32 pb-6 relative z-10">
        {/* Premium Hero Section */}
        <div className="text-center mb-8 sm:mb-12 space-y-3 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-3">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span className="text-xs sm:text-sm font-semibold text-indigo-300 tracking-wide">Get in Touch</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black animate-slide-in-up tracking-tighter" style={{ animationDelay: '0.1s' }}>
            <span className="block bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-gradient-flow leading-[1.1]">
              {contactData.title}
            </span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed animate-slide-in-up px-4 font-medium" style={{ animationDelay: '0.2s' }}>
            {contactData.subtitle}
          </p>
        </div>

        {/* Premium Cards Grid - Now 4 columns for maximum visibility */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-slide-in-up" style={{ animationDelay: '0.3s' }}>
          {/* Email Support Card */}
          <Card className="group relative overflow-hidden border-2 border-white/5 hover:border-blue-500/50 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-[#0c0e1a]/40 backdrop-blur-xl flex flex-col items-center justify-center p-7">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 px-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-500 mb-1">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-bold text-sm">
                Email Support
              </span>
              <div className="mt-3 flex flex-col gap-1">
                <a
                  href={`mailto:${contactData.content.support_email}`}
                  className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline break-all"
                >
                  {contactData.content.support_email}
                </a>
                <p className="text-[10px] text-gray-500">24/7 Response</p>
              </div>
            </div>
          </Card>

          {/* Phone Support Card */}
          <Card className="group relative overflow-hidden border-2 border-white/5 hover:border-green-500/50 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-[#0c0e1a]/40 backdrop-blur-xl flex flex-col items-center justify-center p-5" style={{ animationDelay: '0.1s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 px-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-500 mb-1">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent font-bold text-sm">
                Phone Support
              </span>
              <div className="mt-3 flex flex-col gap-1">
                <a
                  href={`tel:${contactData.content.phone.replace(/\s/g, '')}`}
                  className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-bold hover:underline"
                >
                  {contactData.content.phone}
                </a>
                <p className="text-[10px] text-gray-500">9 AM - 5 PM IST</p>
              </div>
            </div>
          </Card>

          {/* Office Hours Card */}
          <Card className="group relative overflow-hidden border-2 border-white/5 hover:border-orange-500/50 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-[#0c0e1a]/40 backdrop-blur-xl flex flex-col items-center justify-center p-5" style={{ animationDelay: '0.2s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 px-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-500 mb-1">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent font-bold text-sm">
                Office Hours
              </span>
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-[10px] sm:text-xs text-gray-300 font-bold leading-tight">
                  {contactData.content.office_hours}
                </p>
                <p className="text-[10px] text-gray-500">Mon - Fri</p>
              </div>
            </div>
          </Card>

          {/* Visit Us Card */}
          <Card className="group relative overflow-hidden border-2 border-white/5 hover:border-red-500/50 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-[#0c0e1a]/40 backdrop-blur-xl flex flex-col items-center justify-center p-5" style={{ animationDelay: '0.3s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 px-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-500 mb-1">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent font-bold text-sm">
                Visit Us
              </span>
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-[10px] sm:text-xs text-gray-300 font-bold leading-tight">
                  ADTU Campus, Guwahati
                </p>
                <p className="text-[10px] text-gray-500">Guwahati, Assam</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Premium Help Section */}
        <div className="mt-8 sm:mt-12 md:mt-16 animate-slide-in-up" style={{ animationDelay: '0.4s' }}>
          <Card className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-6 sm:p-8 md:p-10 lg:p-12 rounded-2xl sm:rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="absolute top-0 left-0 w-full h-full opacity-20">
              <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
              <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl"></div>
            </div>
            <div className="relative z-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-white/20 backdrop-blur-sm mb-3 sm:mb-4 md:mb-6 shadow-xl animate-pulse">
                <Headphones className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2 sm:mb-3 md:mb-4">
                Need Immediate Help?
              </h2>
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/90 mb-4 sm:mb-6 md:mb-8 max-w-2xl mx-auto">
                Our dedicated support team is here to assist you with any questions or concerns about your bus service.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href={`mailto:${contactData.content.support_email}`}
                  className="px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 bg-white text-blue-600 hover:bg-gray-100 rounded-lg sm:rounded-xl font-bold shadow-2xl transform hover:scale-105 transition-all duration-300 inline-flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  Email Us
                </a>
                <a
                  href={`tel:${contactData.content.phone.replace(/\s/g, '')}`}
                  className="px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 bg-white/10 backdrop-blur-sm border-2 border-white text-white hover:bg-white/20 rounded-lg sm:rounded-xl font-bold shadow-2xl transform hover:scale-105 transition-all duration-300 inline-flex items-center gap-2">
                  <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
                  Call Us
                </a>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}



