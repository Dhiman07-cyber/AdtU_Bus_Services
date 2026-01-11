"use client";

import { motion } from "framer-motion";

export const PageTransition = ({ children }: { children: React.ReactNode }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, translateY: 10 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            exit={{ opacity: 0, scale: 0.98, translateY: -10 }}
            transition={{
                type: "spring",
                stiffness: 260,
                damping: 20
            }}
            className="w-full h-full"
        >
            {children}
        </motion.div>
    );
};
