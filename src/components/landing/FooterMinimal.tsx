"use client";

import React from "react";
import Link from "next/link";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterMinimalProps {
  links: FooterLink[];
  copyright: string;
}

export function FooterMinimal({ links, copyright }: FooterMinimalProps) {
  return (
    <footer className="py-12 bg-landing-bg-1000 border-t border-landing-glass">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-landing-accent"
            >
              <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.1" />
              <path
                d="M8 12L16 8L24 12V20C24 22.2091 22.2091 24 20 24H12C9.79086 24 8 22.2091 8 20V12Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 16H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-semibold text-landing-text">ADTU Bus</span>
          </div>
          
          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6">
            {links.map((link, index) => (
              <Link
                key={index}
                href={link.href}
                className="text-sm text-landing-muted hover:text-landing-text transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          
          {/* Copyright */}
          <div className="text-sm text-landing-muted">
            {copyright}
          </div>
        </div>
      </div>
    </footer>
  );
}
