import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Shared frame for the 5 auth screens (login, signup, verify-otp,
 * forgot-password, reset-password) — no boxed/rounded card, on mobile or
 * desktop. A centered narrow column on a full-height page instead: natural
 * content height (the page scrolls if a screen's content is ever taller
 * than the viewport, nothing clips), a subtle brand-tinted doodle backdrop
 * for some visual life without competing with the form, and the
 * wordmark pinned in the corner as a brand anchor since these screens have
 * no nav chrome of their own.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-x-hidden bg-surface px-6 py-10 md:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-brand/[0.04] dark:bg-brand/[0.06]"
      >
        <div
          className="absolute inset-0 opacity-90 dark:opacity-80 dark:invert"
          style={{
            backgroundImage: "url('/brand/doodles.svg')",
            backgroundRepeat: "repeat",
            backgroundSize: "280px auto",
          }}
        />
      </div>

      <div className="absolute left-8 top-8 z-10 hidden md:block">
        <Wordmark accentClassName="text-brand" className="text-lg" />
      </div>

      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}
