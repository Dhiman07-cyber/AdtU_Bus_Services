"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, Clock, MapPin, Headphones, MessageCircle, Sparkles, Loader2 } from 'lucide-react';

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
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-indigo-500 animate-spin" />
          <p className="text-zinc-400 font-medium">Loading contact details...</p>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/20 mt-12 sm:mt-16 md:mt-20">
      {/* Animated Background Decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-60 right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-40 left-1/3 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-12 relative z-10">
        {/* Premium Hero Section */}
        <div className="text-center mb-6 sm:mb-8 md:mb-12 space-y-3 sm:space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-4">
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-indigo-400" />
            <span className="text-xs sm:text-sm font-semibold text-indigo-300">Get in Touch</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
            <span className="block bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-gradient-flow">
              {contactData.title}
            </span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed animate-slide-in-up px-4" style={{ animationDelay: '0.2s' }}>
            {contactData.subtitle}
          </p>
        </div>

        {/* Premium Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 animate-slide-in-up" style={{ animationDelay: '0.3s' }}>
          {/* Email Support Card */}
          <Card className="group relative overflow-hidden border-2 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-card/60 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg md:text-xl">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-bold">
                  Email Support
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <a
                href={`mailto:${contactData.content.support_email}`}
                className="text-sm sm:text-base md:text-lg text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline transition-colors duration-300 inline-flex items-center gap-2"
              >
                {contactData.content.support_email}
                <Mail className="h-4 w-4" />
              </a>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                We'll respond within 24 hours
              </p>
            </CardContent>
          </Card>

          {/* Phone Support Card */}
          <Card className="group relative overflow-hidden border-2 hover:border-green-300 dark:hover:border-green-700 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-card/60 backdrop-blur-sm" style={{ animationDelay: '0.1s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg md:text-xl">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <Phone className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent font-bold">
                  Phone Support
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <a
                href={`tel:${contactData.content.phone.replace(/\s/g, '')}`}
                className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors duration-300 inline-flex items-center gap-2 sm:gap-3">
                {contactData.content.phone}
                <Phone className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
              </a>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Call us anytime during office hours
              </p>
            </CardContent>
          </Card>

          {/* Office Hours Card */}
          <Card className="group relative overflow-hidden border-2 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-card/60 backdrop-blur-sm" style={{ animationDelay: '0.2s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg md:text-xl">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent font-bold">
                  Office Hours
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-sm sm:text-base md:text-lg text-gray-700 dark:text-gray-300 font-medium">
                {contactData.content.office_hours}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Available during business days
              </p>
            </CardContent>
          </Card>

          {/* Address Card */}
          <Card className="group relative overflow-hidden border-2 hover:border-red-300 dark:hover:border-red-700 transition-all duration-500 animate-fade-in hover-lift shadow-xl bg-card/60 backdrop-blur-sm" style={{ animationDelay: '0.3s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg md:text-xl">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <MapPin className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent font-bold">
                  Visit Us
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-xs sm:text-sm md:text-base text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
                {contactData.content.address}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Come visit our office anytime
              </p>
            </CardContent>
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



