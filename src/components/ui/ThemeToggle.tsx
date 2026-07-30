"use client";

import { useEffect, useState } from "react";
import { SunIconFill, MoonIconFill } from "@/components/ui/icons";
import { useThemeStore } from "@/stores/themeStore";

/**
 * Light/dark toggle. Renders a neutral icon until mounted to avoid a
 * server/client hydration mismatch (the real theme is only knowable client-side).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand ${className}`}
    >
      {isDark ? (
        <SunIconFill className="h-5 w-5" weight="regular" />
      ) : (
        <MoonIconFill className="h-5 w-5" weight="regular" />
      )}
    </button>
  );
}
