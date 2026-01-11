"use client";

import React from "react";
import { Icon } from "./Icon";
import { ScrollRevealWrapper } from "./ScrollRevealWrapper";

interface Role {
  role: string;
  bullets: string[];
  icon: "student" | "driver" | "moderator" | "admin";
}

interface RoleHighlightsProps {
  roles: Role[];
}

export function RoleHighlights({ roles }: RoleHighlightsProps) {
  return (
    <section className="py-24 md:py-32 bg-landing-bg-1000">
      <div className="container mx-auto px-4">
        <ScrollRevealWrapper className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-text mb-4">
            Built for everyone
          </h2>
          <p className="text-lg text-landing-muted max-w-2xl mx-auto">
            Tailored experiences for each role in your campus ecosystem
          </p>
        </ScrollRevealWrapper>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {roles.map((role, index) => (
            <ScrollRevealWrapper key={index} delay={index * 100}>
              <div className="h-full p-6 bg-landing-surface border border-landing-glass rounded-xl hover:border-landing-accent-2/50 transition-all duration-300 backdrop-blur-sm">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-landing-accent-2/10 mb-4">
                  <Icon name={role.icon} className="w-6 h-6 text-landing-accent-2" />
                </div>
                
                <h3 className="text-lg font-bold text-landing-text mb-4">
                  {role.role}
                </h3>
                
                <ul className="space-y-2">
                  {role.bullets.map((bullet, bulletIndex) => (
                    <li
                      key={bulletIndex}
                      className="flex items-start gap-2 text-sm text-landing-muted"
                    >
                      <Icon name="check" className="w-4 h-4 text-landing-success flex-shrink-0 mt-0.5" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollRevealWrapper>
          ))}
        </div>
      </div>
    </section>
  );
}
