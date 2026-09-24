"use client";

import { useEffect, useState } from "react";
import { useSoundStore } from "@/stores/soundStore";

/** A small on/off switch — renders "off" until mounted to avoid a
 * server/client hydration mismatch, same reasoning ThemeToggle already
 * uses (the real preference is only knowable client-side, from
 * localStorage). */
export function SoundToggle({ className = "" }: { className?: string }) {
  const { enabled, toggle } = useSoundStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = mounted && enabled;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Turn off sound effects" : "Turn on sound effects"}
      onClick={toggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        on ? "bg-brand" : "bg-line dark:bg-white/15"
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200 ease-out ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
