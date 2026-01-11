"use client";

import React from "react";
import { ScrollRevealWrapper } from "./ScrollRevealWrapper";

interface CTASectionProps {
  title: string;
  subtitle: string;
  buttonText: string;
  footnote: string;
  onCtaClick: () => void;
  loading?: boolean;
}

export function CTASection({
  title,
  subtitle,
  buttonText,
  footnote,
  onCtaClick,
  loading = false,
}: CTASectionProps) {
  return (
    <section className="relative py-24 md:py-32 bg-gradient-to-br from-landing-accent via-landing-accent to-landing-accent-2 overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="cta-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cta-pattern)" />
        </svg>
      </div>
      
      <div className="relative container mx-auto px-4">
        <ScrollRevealWrapper className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            {title}
          </h2>
          <p className="text-lg md:text-xl text-blue-100 mb-8">
            {subtitle}
          </p>
          
          <button
            onClick={onCtaClick}
            disabled={loading}
            className="inline-flex items-center px-8 py-4 bg-white text-landing-accent rounded-lg font-semibold text-lg hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-landing-accent transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : buttonText}
          </button>
          
          <p className="mt-6 text-sm text-blue-100">
            {footnote}
          </p>
        </ScrollRevealWrapper>
      </div>
    </section>
  );
}
