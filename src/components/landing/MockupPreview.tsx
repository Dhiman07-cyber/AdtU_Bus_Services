"use client";

import React from "react";
import { ScrollRevealWrapper } from "./ScrollRevealWrapper";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface MockupPreviewProps {
  caption: string;
}

export function MockupPreview({ caption }: MockupPreviewProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <section id="mockup" className="py-24 md:py-32 bg-landing-bg-900">
      <div className="container mx-auto px-4">
        <ScrollRevealWrapper className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-text mb-4">
            See it in action
          </h2>
          <p className="text-lg text-landing-muted max-w-2xl mx-auto">
            {caption}
          </p>
        </ScrollRevealWrapper>
        
        <ScrollRevealWrapper delay={200} className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-landing-accent/20 via-landing-accent-2/20 to-landing-accent/20 blur-3xl" />
            
            {/* Main mockup container */}
            <div className="relative bg-landing-surface border border-landing-glass rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-sm">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-landing-glass">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 bg-landing-bg-1000 rounded-md text-xs text-landing-muted">
                    bus.adtu.in
                  </div>
                </div>
              </div>
              
              {/* Interactive map mockup */}
              <div className="aspect-video bg-landing-bg-1000 rounded-xl overflow-hidden relative">
                <svg
                  viewBox="0 0 800 450"
                  className="w-full h-full"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Background */}
                  <rect width="800" height="450" fill="#07090d" />
                  
                  {/* Grid lines */}
                  <defs>
                    <pattern
                      id="grid"
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="#0f1723"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="800" height="450" fill="url(#grid)" />
                  
                  {/* Route paths */}
                  <path
                    d="M 100 350 Q 200 300, 300 350 T 500 350"
                    stroke="#2563eb"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray="12 6"
                    opacity="0.6"
                  />
                  
                  <path
                    d="M 150 250 L 400 180 L 650 250"
                    stroke="#06b6d4"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray="12 6"
                    opacity="0.4"
                  />
                  
                  {/* Stop markers */}
                  <circle cx="100" cy="350" r="10" fill="#10b981" opacity="0.8" />
                  <circle cx="300" cy="350" r="8" fill="#94a3b8" opacity="0.5" />
                  <circle cx="500" cy="350" r="10" fill="#10b981" opacity="0.8" />
                  
                  {/* Active bus with animation */}
                  <g className={prefersReducedMotion ? "" : "animate-bus-journey"}>
                    {/* Bus pulse */}
                    <circle cx="350" cy="350" r="30" fill="#2563eb" opacity="0.1">
                      {!prefersReducedMotion && (
                        <animate
                          attributeName="r"
                          values="30;40;30"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      )}
                    </circle>
                    
                    {/* Bus icon */}
                    <circle cx="350" cy="350" r="18" fill="#2563eb" />
                    <rect
                      x="342"
                      y="342"
                      width="16"
                      height="16"
                      fill="white"
                      rx="2"
                    />
                  </g>
                  
                  {/* Info popup */}
                  <g transform="translate(350, 290)">
                    <rect
                      x="-60"
                      y="-40"
                      width="120"
                      height="50"
                      rx="8"
                      fill="#0f1723"
                      stroke="#2563eb"
                      strokeWidth="2"
                    />
                    <text
                      x="0"
                      y="-20"
                      fill="#f8fafc"
                      fontSize="14"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      Bus #5
                    </text>
                    <text
                      x="0"
                      y="0"
                      fill="#94a3b8"
                      fontSize="12"
                      textAnchor="middle"
                    >
                      ETA: 6 mins
                    </text>
                    
                    {/* Popup pointer */}
                    <polygon
                      points="0,10 -8,2 8,2"
                      fill="#0f1723"
                    />
                  </g>
                  
                  {/* Notification card */}
                  <g transform="translate(620, 80)">
                    <rect
                      x="0"
                      y="0"
                      width="160"
                      height="80"
                      rx="12"
                      fill="#0f1723"
                      fillOpacity="0.95"
                      stroke="#06b6d4"
                      strokeWidth="1"
                    />
                    <circle cx="20" cy="20" r="8" fill="#06b6d4" />
                    <text
                      x="20"
                      y="45"
                      fill="#f8fafc"
                      fontSize="11"
                      fontWeight="600"
                    >
                      Bus arriving
                    </text>
                    <text
                      x="20"
                      y="60"
                      fill="#94a3b8"
                      fontSize="9"
                    >
                      Gate 2 in 3 mins
                    </text>
                  </g>
                  
                  {/* Student waiting flag */}
                  <g transform="translate(500, 330)">
                    <circle cx="0" cy="0" r="6" fill="#10b981" />
                    <text
                      x="0"
                      y="-12"
                      fill="#10b981"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      ⚑
                    </text>
                  </g>
                </svg>
                
                {/* Live indicator */}
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-landing-surface/90 backdrop-blur-sm rounded-full border border-landing-glass">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-landing-text font-medium">LIVE</span>
                </div>
              </div>
              
              {/* Feature tags */}
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                <div className="px-3 py-1.5 bg-landing-bg-1000 rounded-md text-xs text-landing-muted border border-landing-glass">
                  Real-time tracking
                </div>
                <div className="px-3 py-1.5 bg-landing-bg-1000 rounded-md text-xs text-landing-muted border border-landing-glass">
                  Instant notifications
                </div>
                <div className="px-3 py-1.5 bg-landing-bg-1000 rounded-md text-xs text-landing-muted border border-landing-glass">
                  Waiting flags
                </div>
              </div>
            </div>
          </div>
        </ScrollRevealWrapper>
      </div>
    </section>
  );
}
