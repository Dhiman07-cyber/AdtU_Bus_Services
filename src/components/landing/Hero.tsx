"use client";

import React from "react";
import { Icon } from "./Icon";

interface HeroProps {
  label: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  chips: string[];
  onPrimaryCta: () => void;
  onSecondaryCta: () => void;
  loading?: boolean;
}

export function Hero({
  label,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  chips,
  onPrimaryCta,
  onSecondaryCta,
  loading = false,
}: HeroProps) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-landing-bg-900">
      {/* Subtle radial gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-landing-accent/5 via-transparent to-landing-accent-2/5" />
      
      <div className="relative z-10 container mx-auto px-4 py-24 md:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left column - Content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-landing-surface/50 border border-landing-glass mb-6 backdrop-blur-sm">
              <span className="text-xs uppercase tracking-wider text-landing-accent-2 font-medium">
                {label}
              </span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-landing-text mb-6 leading-tight">
              {title}
            </h1>
            
            <p className="text-lg sm:text-xl text-landing-muted mb-8 max-w-2xl mx-auto lg:mx-0">
              {subtitle}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
              <button
                onClick={onPrimaryCta}
                disabled={loading}
                className="group relative px-8 py-4 bg-landing-accent text-white rounded-lg font-semibold text-lg hover:bg-landing-accent/90 focus:outline-none focus:ring-2 focus:ring-landing-accent focus:ring-offset-2 focus:ring-offset-landing-bg-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : primaryCta}
              </button>
              
              <button
                onClick={onSecondaryCta}
                className="px-8 py-4 bg-landing-surface/50 text-landing-text rounded-lg font-semibold text-lg border border-landing-glass hover:bg-landing-surface/80 focus:outline-none focus:ring-2 focus:ring-landing-accent-2 focus:ring-offset-2 focus:ring-offset-landing-bg-900 transition-all backdrop-blur-sm"
              >
                {secondaryCta}
              </button>
            </div>
            
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              {chips.map((chip, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-landing-surface/30 border border-landing-glass backdrop-blur-sm"
                >
                  <Icon name="check" className="w-4 h-4 text-landing-success" />
                  <span className="text-sm text-landing-muted">{chip}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Right column - Animated mockup */}
          <div className="relative lg:pl-8">
            <HeroMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-landing-accent/20 blur-3xl rounded-full" />
      
      {/* Device frame */}
      <div className="relative bg-landing-surface border border-landing-glass rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="aspect-video bg-landing-bg-1000 rounded-lg overflow-hidden">
          {/* Animated bus tracking mockup */}
          <svg
            viewBox="0 0 600 400"
            className="w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background */}
            <rect width="600" height="400" fill="#07090d" />
            
            {/* Route path */}
            <path
              d="M 100 200 Q 200 150, 300 200 T 500 200"
              stroke="#2563eb"
              strokeWidth="3"
              fill="none"
              strokeDasharray="8 4"
              opacity="0.5"
            />
            
            {/* Bus icon (animated) */}
            <g className="animate-bus-move">
              <circle cx="300" cy="200" r="20" fill="#2563eb" opacity="0.2" />
              <circle cx="300" cy="200" r="12" fill="#2563eb" />
              <rect
                x="294"
                y="194"
                width="12"
                height="12"
                fill="white"
                rx="2"
              />
            </g>
            
            {/* Start point */}
            <circle cx="100" cy="200" r="8" fill="#10b981" />
            <text x="100" y="230" fill="#94a3b8" fontSize="12" textAnchor="middle">
              Start
            </text>
            
            {/* End point */}
            <circle cx="500" cy="200" r="8" fill="#06b6d4" />
            <text x="500" y="230" fill="#94a3b8" fontSize="12" textAnchor="middle">
              Campus
            </text>
          </svg>
        </div>
        
        {/* Status bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-landing-success animate-pulse" />
            <span className="text-xs text-landing-muted">Live tracking active</span>
          </div>
          <div className="text-xs text-landing-muted">•</div>
          <div className="text-xs text-landing-muted">ETA: 8 mins</div>
        </div>
      </div>
    </div>
  );
}
