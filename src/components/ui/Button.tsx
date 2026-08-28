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

// Opt-in look for the welcome screen only: blue/white swap colors on hover
// (blue flips to white/blue-text, white flips to blue/white-text, mirror
// images of each other) with a bolder border so the swap still reads
// against the screen's solid blue backdrop. Every other screen (onboarding,
// profile setup, etc.) keeps the plain look above, including the same
// press/click feel — pass `invert` only where this specific color
// treatment was asked for.
const INVERT_VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[0_10px_24px_-8px_rgba(22,90,191,0.6)] border-2 border-white/70 hover:border-brand hover:bg-white hover:text-brand disabled:bg-brand/40",
  secondary:
    "bg-white text-brand border-2 border-brand hover:border-white/70 hover:bg-brand hover:text-white disabled:opacity-50",
  ghost: "bg-transparent text-brand hover:bg-brand/5 disabled:opacity-50",
};

interface ButtonProps extends HTMLMotionProps<"button"> {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  /** Welcome-screen-only color treatment — see INVERT_VARIANTS above.
   * Defaults off everywhere else. Click/press feel is unchanged either way. */
  invert?: boolean;
}

/** PrimaryButton, ported from mobile: pill shape, press-scale, loading spinner. */
export function Button({
  children,
  variant = "primary",
  loading = false,
  fullWidth = true,
  className = "",
  disabled,
  invert = false,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 font-nunito text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
        (invert ? INVERT_VARIANTS : VARIANTS)[variant]
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        children
      )}
    </motion.button>
  );
}
