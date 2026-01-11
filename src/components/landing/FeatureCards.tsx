"use client";

import React from "react";
import { Icon } from "./Icon";
import { ScrollRevealWrapper } from "./ScrollRevealWrapper";

interface Feature {
  title: string;
  text: string;
  icon: "users" | "map" | "bell";
}

interface FeatureCardsProps {
  features: Feature[];
}

export function FeatureCards({ features }: FeatureCardsProps) {
  return (
    <section className="py-24 md:py-32 bg-landing-bg-1000">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <ScrollRevealWrapper key={index} delay={index * 100}>
              <div className="group relative h-full p-8 bg-landing-surface border border-landing-glass rounded-2xl hover:border-landing-accent/50 transition-all duration-300 hover:scale-[1.02] backdrop-blur-sm">
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-landing-accent/10 mb-6 group-hover:bg-landing-accent/20 transition-colors">
                  <Icon name={feature.icon} className="w-7 h-7 text-landing-accent" />
                </div>
                
                <h3 className="text-xl font-bold text-landing-text mb-3">
                  {feature.title}
                </h3>
                
                <p className="text-landing-muted leading-relaxed">
                  {feature.text}
                </p>
              </div>
            </ScrollRevealWrapper>
          ))}
        </div>
      </div>
    </section>
  );
}
