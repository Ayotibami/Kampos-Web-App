"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { X, Check } from "@/components/ui/icons";
import { env } from "@/lib/env";

// Standard moderation categories — matches what most platforms surface
// (bullying/hate/violence/sexual content etc get their own explicit option
// instead of being lumped into a vague "Inappropriate"), "Other" stays last
// as the catch-all with free text.
const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate speech",
  "Violence or threats",
  "Nudity or sexual content",
  "Self-harm or suicide",
  "False information",
  "Scam or fraud",
  "Impersonation",
  "Other",
];

/**
 * Full-size report dialog (replaces the old small pop-out menu) — a report
 * is a deliberate, considered action, not a quick one-tap toggle like a
 * reaction, so it gets a real dialog with room for a description and an
 * "Other" free-text reason instead of a cramped corner menu. Brand-toned,
 * same as every other selectable-pill UI in the app (Chip) — red read as
 * alarming for what's just a routine form, not an actual destructive
 * action like ConfirmModal's delete flow.
 */
export function ReportModal({
  open,
  onClose,
  onSubmit,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  const isOther = selected === "Other";
  const canSubmit = selected && (!isOther || otherText.trim().length > 0);

  // Custom scroll-position indicator (native scrollbar hidden via
  // no-scrollbar) — same idea as the comment composer. Without this, the
  // pill list/Other textarea overflowing wasn't obvious, especially once
  // the textarea appears and pushes content past the visible area.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollThumb, setScrollThumb] = useState<{ top: number; height: number } | null>(null);
  const updateScrollThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 1) {
      setScrollThumb(null);
      return;
    }
    const heightFrac = el.clientHeight / el.scrollHeight;
    const topFrac = el.scrollTop / el.scrollHeight;
    setScrollThumb({ top: topFrac * 100, height: heightFrac * 100 });
  }, []);
  useEffect(() => {
    // Recompute whenever the content that affects scroll height changes —
    // most notably the Other textarea appearing/disappearing.
    updateScrollThumb();
  }, [open, isOther, updateScrollThumb]);

  const handleClose = () => {
    if (loading) return;
    onClose();
    // Reset for next time, after the close animation has room to finish.
    setTimeout(() => {
      setSelected(null);
      setOtherText("");
    }, 200);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(isOther ? otherText.trim() : selected!);
  };

  return (
    <Modal open={open} onClose={handleClose} className="h-[75vh] w-[60vw] max-md:h-[90vh] max-md:w-[92vw]">
      <div className="relative flex h-full flex-col rounded-3xl bg-surface-2 p-10 shadow-2xl">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-6 top-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <h2 className="shrink-0 pr-12 font-poppins text-2xl font-bold text-ink">Report this gist</h2>

        <p className="mt-3 shrink-0 font-poppins text-sm leading-relaxed text-muted">
          Kampos is a safe space — we work hard to keep your feed free of harmful content.
          If this gist breaks our{" "}
          <a
            href={env.COMMUNITY_GUIDELINES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand underline underline-offset-2"
          >
            community guidelines
          </a>
          , report it and we&apos;ll review and act on it. Rest assured, your report is 100%
          anonymous.
        </p>

        {/* Reason pills — small and horizontally arranged (wrapping as
            needed), not one row eating the full width each. */}
        <div className="relative mt-8 min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={updateScrollThumb}
            className="h-full overflow-y-auto pr-4 no-scrollbar"
          >
            <div className="flex flex-wrap gap-3">
              {REPORT_REASONS.map((reason) => {
                const isSelected = selected === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelected(reason)}
                    className={`flex items-center gap-1.5 rounded-full border px-5 py-2.5 font-poppins text-sm font-medium transition ${
                      isSelected
                        ? "border-brand bg-brand text-white"
                        : "border-brand/60 bg-[#F3F6F9] text-brand hover:bg-brand/5"
                    }`}
                  >
                    {reason}
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>

            {isOther && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Tell us more..."
                rows={4}
                maxLength={300}
                autoFocus
                className="mt-6 w-full resize-none overflow-y-auto rounded-2xl border border-line bg-transparent px-5 py-4 font-poppins text-sm text-ink outline-none no-scrollbar placeholder:text-faint focus:border-brand"
              />
            )}
          </div>

          {/* Sleeker stand-in for the native scrollbar — same pattern as
              the comment composer, so it's obvious there's more to scroll
              to, especially once the Other textarea pushes content taller. */}
          {scrollThumb && (
            <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-1 rounded-full bg-black/10 dark:bg-white/15">
              <div
                className="absolute w-full rounded-full bg-brand/60 dark:bg-white/50"
                style={{ top: `${scrollThumb.top}%`, height: `${scrollThumb.height}%` }}
              />
            </div>
          )}
        </div>

        {/* Submit — not full width, this isn't the primary/only thing on
            the card the way it is on a single-purpose form. */}
        <div className="mt-3 shrink-0">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            loading={loading}
            fullWidth={false}
            className="!px-7 !py-2.5"
          >
            Report
          </Button>
        </div>
      </div>
    </Modal>
  );
}
