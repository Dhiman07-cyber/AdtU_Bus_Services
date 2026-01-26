"use client";

import { PageTransition } from "@/components/page-transition";

export default function Template({ children }: { children: React.ReactNode }) {
    // Ensure smooth scroll is re-initialized/updated on route change if needed
    // (Though the Provider handles global init, this can handle route-specific resets if required)
    return <PageTransition>{children}</PageTransition>;
}
