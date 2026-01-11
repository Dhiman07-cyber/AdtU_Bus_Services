"use client";

import React from "react";
import { Icon } from "./Icon";
import { ScrollRevealWrapper } from "./ScrollRevealWrapper";

interface Step {
  step: string;
  title: string;
  text: string;
}

interface HowItWorksProps {
  steps: Step[];
}

export function HowItWorks({ steps }: HowItWorksProps) {
  return (
    <section className="py-24 md:py-32 bg-landing-bg-900">
      <div className="container mx-auto px-4">
        <ScrollRevealWrapper className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-text mb-4">
            How it works
          </h2>
          <p className="text-lg text-landing-muted max-w-2xl mx-auto">
            Three simple steps to modernize your campus transportation
          </p>
        </ScrollRevealWrapper>
        
        <div className="grid md:grid-cols-3 gap-8 md:gap-6 relative">
          {/* Connection lines (hidden on mobile) */}
          <div className="hidden md:block absolute top-16 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-landing-glass to-transparent" />
          
          {steps.map((step, index) => (
            <ScrollRevealWrapper key={index} delay={index * 150}>
              <div className="relative">
                {/* Step number circle */}
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-landing-accent/10 border-2 border-landing-accent mb-6 mx-auto relative z-10">
                  <span className="text-2xl font-bold text-landing-accent">
                    {step.step}
                  </span>
                </div>
                
                {/* Arrow connector (hidden on last item and mobile) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%]">
                    <Icon name="arrow-right" className="w-6 h-6 text-landing-muted/30" />
                  </div>
                )}
                
                <div className="text-center">
                  <h3 className="text-xl font-bold text-landing-text mb-3">
                    {step.title}
                  </h3>
                  <p className="text-landing-muted leading-relaxed">
                    {step.text}
                  </p>
                </div>
              </div>
            </ScrollRevealWrapper>
          ))}
        </div>
      </div>
    </section>
  );
}
