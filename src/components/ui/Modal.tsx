"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "center" for dialogs, "sheet" for a bottom sheet on mobile. */
  variant?: "center" | "sheet";
  /** Dismiss on backdrop click / Escape. Off for flows you must complete. */
  dismissable?: boolean;
  /**
   * A "sheet" still pinned to the bottom on mobile (thumb-reach), but
   * promoted to a proper centered dialog from `md:` up instead of staying
   * anchored to the bottom edge of a wide desktop viewport. Ignored for
   * variant="center", which is already always centered.
   */
  desktopCenter?: boolean;
}

/** Base animated overlay used by all dialogs/sheets. Locks body scroll while open. */
export function Modal({
  open,
  onClose,
  children,
  variant = "center",
  dismissable = true,
  desktopCenter = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (dismissable && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, dismissable, onClose]);

  const isSheet = variant === "sheet";

  // Portalled to document.body — a modal can be triggered from deep inside
  // a Framer Motion-animated card (e.g. GistStack's swipeable cards), and a
  // `transform` on any ancestor becomes the containing block for `position:
  // fixed` descendants. Without the portal this would render trapped inside
  // that card's own animated box instead of actually covering the viewport
  // (same issue GistMediaOverlay solves the same way).
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex justify-center" role="dialog" aria-modal>
          <motion.div
            className="absolute inset-0 bg-brand-ink/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissable ? onClose : undefined}
          />
          <motion.div
            className={
              isSheet
                ? `relative z-10 mt-auto w-full max-w-[520px]${
                    desktopCenter ? " md:m-auto md:w-[min(90vw,600px)] md:max-w-none" : ""
                  }`
                : "relative z-10 m-auto w-[min(92vw,420px)]"
            }
            initial={isSheet ? { y: "100%" } : { opacity: 0, scale: 0.94, y: 8 }}
            animate={isSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isSheet ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
