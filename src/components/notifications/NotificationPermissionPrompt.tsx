"use client";

/**
 * The one-time explainer shown right after a new user finishes setup,
 * before the browser's own native permission dialog — asking cold, with no
 * context, tanks grant rates and (worse) a "Block" tap here is permanent
 * for the origin. This buys one sentence of "why" first.
 *
 * Deliberately persistent, not a one-time tip: FeedContent re-shows this
 * every day the feed opens for as long as the account hasn't actually
 * enabled push (checked live via isSubscribed, not just remembered) — see
 * hasSeenPermissionPromptToday/markPermissionPromptSeenToday in
 * lib/onboarding.ts. "Not now" only silences it until tomorrow.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BellIconFill } from "@/components/ui/icons";
import { subscribeToPush } from "@/lib/notificationPush";

export function NotificationPermissionPrompt({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
    } catch {
      // A denial or a mid-flow error both just mean no subscription got
      // created — nothing further to show here, PushOptInBanner on the
      // Notifications page is still there if they change their mind later.
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <Modal open={open} onClose={onDone} variant="sheet" desktopCenter>
      <div className="rounded-t-[26px] bg-surface-2 px-6 pb-6 pt-5 text-center md:rounded-[26px]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/12 text-brand">
          <BellIconFill className="h-7 w-7" weight="fill" />
        </div>

        <h2 className="mb-2 font-nunito text-[18px] font-extrabold tracking-tight text-ink">
          Never miss the gist
        </h2>
        <p className="mb-5 font-nunito text-[13.5px] leading-relaxed text-muted">
          So many things dey happen for Kampos — we no go like am if you miss the gist, updates, and vibes.
          Turn on notifications so you catch replies, reactions, and whatever&apos;s popping — even when
          Kampos isn&apos;t open.
        </p>

        <Button onClick={handleEnable} loading={busy} disabled={busy}>
          Turn on notifications
        </Button>
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          className="mt-3 w-full py-1.5 font-nunito text-[13px] font-semibold text-faint disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </Modal>
  );
}
