"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Selectable pill — used for levels and major tags. */
export function Chip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`rounded-full border px-5 py-2 font-poppins text-xs font-medium transition ${
        selected
          ? "border-brand bg-brand text-white"
          : "border-brand/60 bg-[#F3F6F9] text-brand hover:bg-brand/5"
      }`}
    >
      {children}
    </motion.button>
  );
}
