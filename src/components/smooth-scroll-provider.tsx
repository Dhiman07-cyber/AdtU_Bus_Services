"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

export default function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
    const lenisRef = useRef<Lenis | null>(null);
    const rafIdRef = useRef<number | null>(null);

    useEffect(() => {
        // Create Lenis instance with optimized settings
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 2,
        });

        lenisRef.current = lenis;

        // Cache for scrollable elements to avoid repeated DOM queries
        const scrollableCache = new WeakSet<Element>();

        const isScrollable = (element: Element): boolean => {
            if (!(element instanceof HTMLElement)) return false;

            // Check cache first
            if (scrollableCache.has(element)) return true;

            const style = window.getComputedStyle(element);
            const isOverflow = ['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflow);
            const result = isOverflow && element.scrollHeight > element.clientHeight;

            if (result) scrollableCache.add(element);
            return result;
        };

        const preventLenisScroll = (e: Event) => {
            let target = e.target as HTMLElement | null;

            // Traverse up to find if we're inside a scrollable element
            while (target && target !== document.body && target !== document.documentElement) {
                if (target.hasAttribute('data-lenis-prevent')) {
                    return; // Already handled
                }

                if (isScrollable(target)) {
                    target.setAttribute('data-lenis-prevent', 'true');
                    return;
                }
                target = target.parentElement;
            }
        };

        // Use passive listeners with capture for better performance
        const options = { passive: true, capture: true };
        window.addEventListener('wheel', preventLenisScroll, options);
        window.addEventListener('touchstart', preventLenisScroll, options);

        // Optimized RAF loop with proper cleanup
        let lastTime = 0;
        function raf(time: number) {
            // Throttle to ~60fps max, skip if less than 16ms passed
            if (time - lastTime >= 16) {
                lenis.raf(time);
                lastTime = time;
            }
            rafIdRef.current = requestAnimationFrame(raf);
        }

        rafIdRef.current = requestAnimationFrame(raf);

        return () => {
            window.removeEventListener('wheel', preventLenisScroll, options as EventListenerOptions);
            window.removeEventListener('touchstart', preventLenisScroll, options as EventListenerOptions);
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
            }
            lenis.destroy();
        };
    }, []);

    return <>{children}</>;
}
