"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            // orientation: 'vertical', // default
            // gestureOrientation: 'vertical', // default
            // smoothWheel: true, // default
            // wheelMultiplier: 1, // default
            // touchMultiplier: 2, // default
            // infinite: false, // default
        });

        const isScrollable = (element: Element): boolean => {
            if (!(element instanceof HTMLElement)) return false;

            const style = window.getComputedStyle(element);
            const isOverflow = ['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflow);

            return isOverflow && element.scrollHeight > element.clientHeight;
        };

        const preventLenisScroll = (e: Event) => {
            let target = e.target as HTMLElement;

            // Traverse up to find if we're inside a scrollable element
            while (target && target !== document.body && target !== document.documentElement) {
                if (isScrollable(target)) {
                    // Check if the element has data-lenis-prevent attribute
                    if (target.hasAttribute('data-lenis-prevent')) {
                        return; // Already handled by Lenis
                    }

                    // Add data-lenis-prevent dynamically if it's scrollable
                    // This is the "global fix" - treating all scrollable containers as separate from Lenis
                    target.setAttribute('data-lenis-prevent', 'true');
                    return;
                }
                target = target.parentElement as HTMLElement;
            }
        };

        // Add listeners to intercept interactions with scrollable elements
        window.addEventListener('wheel', preventLenisScroll, { passive: false, capture: true });
        window.addEventListener('touchstart', preventLenisScroll, { passive: false, capture: true });
        window.addEventListener('keydown', preventLenisScroll, { passive: false, capture: true }); // For keyboard navigation if needed

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => {
            window.removeEventListener('wheel', preventLenisScroll, { capture: true });
            window.removeEventListener('touchstart', preventLenisScroll, { capture: true });
            window.removeEventListener('keydown', preventLenisScroll, { capture: true });
            lenis.destroy();
        };
    }, []);

    return <>{children}</>;
}
