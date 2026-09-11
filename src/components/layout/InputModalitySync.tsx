"use client";

import { useEffect } from "react";

/**
 * Tags <html data-input="keyboard|pointer"> so globals.css can show a focus
 * ring only for real keyboard navigation. Plain :focus-visible on its own
 * wasn't reliable enough — Safari/iOS in particular still lights up
 * :focus-visible on a plain tap for native <button>s, which is exactly the
 * "border appears whenever I tap anything" complaint this replaces.
 * Tracking modality directly sidesteps that browser heuristic entirely:
 * the ring only shows if the very last input anywhere on the page was a
 * Tab keypress, not a click or touch.
 */
export function InputModalitySync() {
  useEffect(() => {
    const setKeyboard = (e: KeyboardEvent) => {
      if (e.key === "Tab") document.documentElement.setAttribute("data-input", "keyboard");
    };
    const setPointer = () => document.documentElement.setAttribute("data-input", "pointer");
    document.addEventListener("keydown", setKeyboard);
    document.addEventListener("pointerdown", setPointer);
    document.addEventListener("touchstart", setPointer, { passive: true });
    return () => {
      document.removeEventListener("keydown", setKeyboard);
      document.removeEventListener("pointerdown", setPointer);
      document.removeEventListener("touchstart", setPointer);
    };
  }, []);

  return null;
}
