"use client";

import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[0_10px_24px_-8px_rgba(22,90,191,0.6)] hover:brightness-105 disabled:bg-brand/40",
  secondary:
    "bg-white text-brand border border-brand hover:bg-brand/5 disabled:opacity-50",
  ghost: "bg-transparent text-brand hover:bg-brand/5 disabled:opacity-50",
};

interface ButtonProps extends HTMLMotionProps<"button"> {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

/** PrimaryButton, ported from mobile: pill shape, press-scale, loading spinner. */
export function Button({
  children,
  variant = "primary",
  loading = false,
  fullWidth = true,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 font-poppins text-sm font-semibold transition disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </motion.button>
  );
}
