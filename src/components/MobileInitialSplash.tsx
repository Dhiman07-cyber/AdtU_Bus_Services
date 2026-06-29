"use client";

import React, { useState, useEffect } from 'react';

export default function MobileInitialSplash() {
  const [visible, setVisible] = useState(true);
  const [displayText, setDisplayText] = useState('Salvaging Details...');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Dismiss initial splash after initial page load settles
    const dismissTimer = setTimeout(() => {
      setVisible(false);
    }, 1200);

    return () => clearTimeout(dismissTimer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const phrases = ["Salvaging Details...", "Striving Information..."];
    const currentPhrase = phrases[phraseIndex];
    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      if (displayText.length < currentPhrase.length) {
        timer = setTimeout(() => {
          setDisplayText(currentPhrase.slice(0, displayText.length + 1));
        }, 70);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 1600);
      }
    } else {
      if (displayText.length > 0) {
        timer = setTimeout(() => {
          setDisplayText(currentPhrase.slice(0, displayText.length - 1));
        }, 35);
      } else {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, phraseIndex, visible]);

  if (!visible) return null;

  return (
    <div
      id="mobile-app-splash"
      className="md:hidden fixed inset-0 z-[999999] bg-[#05060e] flex flex-col items-center justify-center p-6 text-white overflow-hidden transition-opacity duration-300 pointer-events-none"
      suppressHydrationWarning
    >
      <div className="mb-8 relative z-10 flex items-center justify-center">
        <img
          src="/adtu-new-logo.svg"
          alt="AdtU Logo"
          className="w-44 h-auto max-w-[75vw] object-contain drop-shadow-[0_0_25px_rgba(99,102,241,0.25)]"
        />
      </div>
      <div className="mb-6 relative z-10">
        <div className="w-8 h-8 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin shadow-lg shadow-indigo-500/10" />
      </div>
      <div className="h-6 flex items-center justify-center relative z-10 px-4">
        <span
          id="mobile-splash-typewriter"
          className="text-sm font-semibold text-slate-300 tracking-wide font-mono"
          suppressHydrationWarning
        >
          {displayText}
        </span>
      </div>
    </div>
  );
}
