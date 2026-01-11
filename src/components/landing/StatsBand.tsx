"use client";

import React from "react";
import { ScrollRevealWrapper } from "./ScrollRevealWrapper";

interface Stat {
  label: string;
  value: string;
}

interface StatsBandProps {
  stats: Stat[];
}

export function StatsBand({ stats }: StatsBandProps) {
  return (
    <section className="py-16 bg-landing-bg-1000 border-y border-landing-glass">
      <div className="container mx-auto px-4">
        <ScrollRevealWrapper>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-text mb-2">
                  {stat.value}
                </div>
                <div className="text-sm md:text-base text-landing-muted uppercase tracking-wide">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </ScrollRevealWrapper>
      </div>
    </section>
  );
}
