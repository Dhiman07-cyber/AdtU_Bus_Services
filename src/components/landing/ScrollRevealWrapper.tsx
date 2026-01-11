"use client";

import React from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface ScrollRevealWrapperProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollRevealWrapper({
  children,
  className = "",
  delay = 0,
}: ScrollRevealWrapperProps) {
  const { ref, isVisible } = useScrollReveal();
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: prefersReducedMotion ? 1 : isVisible ? 1 : 0,
        transform: prefersReducedMotion
          ? "none"
          : isVisible
          ? "translateY(0)"
          : "translateY(12px)",
        transition: prefersReducedMotion
          ? "none"
          : `opacity 300ms ease ${delay}ms, transform 300ms ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
