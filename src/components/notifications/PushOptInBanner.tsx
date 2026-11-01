"use client";

/**
 * The regular-user push opt-in — lives at the top of /notifications,
 * mirroring villagepeople/me's own PushNotificationToggle.tsx but for
 * everyone, not just admins (see KamposBackend's notification.service.ts
 * PUSH_DAILY_CAP doc comment for the product reasoning behind what this
 * turns on).
 *
 * iOS Safari can't do Web Push at all unless the app's been added to the
 * Home Screen first (an Apple platform restriction, not something this app
 * controls) — tapping Enable in that state can't show the real permission
 * prompt at all, so it shows the same Share -> Add to Home Screen
 * walkthrough InstallPrompt.tsx already uses instead of a dead button.
 * This only triggers on the toggle tap itself, never as its own separate
 * nag — the existing global InstallPrompt already handles the general
 * "put Kampos on your home screen" nudge on its own schedule.
 */

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage } from "@/lib/api";
import { ShareBoxIconFill, AddToHomeIconFill, BellIconFill } from "@/components/ui/icons";
import { detectIOSSafari, isStandalone } from "@/lib/pwaInstall";
import {
  getPushSupport,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSupport,
} from "@/lib/notificationPush";

export function PushOptInBanner() {
  const [needsInstallFirst] = useState(() => detectIOSSafari() && !isStandalone());
  const [support, setSupport] = useState<PushSupport | "checking">("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstallSteps, setShowInstallSteps] = useState(false);

  useEffect(() => {
    if (needsInstallFirst) {
      // Nothing to check — iOS Safari outside standalone has no
      // serviceWorker/PushManager at all, so getPushSupport() would read
      // "unsupported" anyway. Short-circuiting avoids a flash of the wrong
      // copy before that resolves.
      setSupport("unsupported");
      return;
    }
    (async () => {
      const s = getPushSupport();
      setSupport(s);
      if (s === "ready") setSubscribed(await isSubscribed());
    })();
  }, [needsInstallFirst]);

  const handleEnable = async () => {
    if (needsInstallFirst) {
      setShowInstallSteps(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush();
      setSubscribed(true);
      setSupport(getPushSupport());
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't turn on notifications"));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't turn off notifications"));
    } finally {
      setBusy(false);
    }
  };

  // Blocked at the browser level — nothing a tap here can fix, and nagging
  // about it would just be noise; same call PushNotificationToggle.tsx
  // (the admin version) already makes.
  if (support === "denied") return null;
  // A genuinely unsupported browser with no home-screen install path
  // either (i.e. not the iOS Safari case, which has its own walkthrough
  // below) — nothing to offer, say nothing.
  if (support === "unsupported" && !needsInstallFirst) return null;

  return (
    <>
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-line bg-brand-tint/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            <BellIconFill className="h-4 w-4" weight="fill" />
          </span>
          <p className="min-w-0 font-nunito text-xs text-ink">
            {subscribed
              ? "You'll get notified even when Kampos isn't open."
              : "Get notified the moment something happens."}
          </p>
        </div>
        <Button
          variant={subscribed ? "secondary" : "primary"}
          fullWidth={false}
          className="!shrink-0 !px-4 !py-1.5 text-xs"
          loading={busy}
          disabled={busy}
          onClick={subscribed ? handleDisable : handleEnable}
        >
          {subscribed ? "Disable" : "Enable"}
        </Button>
      </div>
      {error && (
        <div className="relative z-10 border-b border-line bg-danger/5 px-4 py-2">
          <p className="font-nunito text-[11px] text-danger">{error}</p>
        </div>
      )}

      <Modal open={showInstallSteps} onClose={() => setShowInstallSteps(false)}>
        <div className="rounded-3xl bg-surface-2 p-6 text-center shadow-2xl">
          <p className="mb-1.5 font-nunito text-base font-bold text-ink">
            Add Kampos to your Home Screen first
          </p>
          <p className="mb-4 font-nunito text-sm text-muted">
            iPhone only sends notifications to apps installed on your Home Screen — small small steps and
            you&apos;re set:
          </p>
          <ol className="mb-5 space-y-3 text-left">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <ShareBoxIconFill size={16} weight="fill" />
              </span>
              <span className="font-nunito text-sm text-ink">
                Tap the <strong>Share</strong> icon in Safari&apos;s toolbar
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <AddToHomeIconFill size={16} weight="fill" />
              </span>
              <span className="font-nunito text-sm text-ink">
                Scroll down, tap <strong>&quot;Add to Home Screen&quot;</strong>
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <BellIconFill className="h-4 w-4" weight="fill" />
              </span>
              <span className="font-nunito text-sm text-ink">
                Open Kampos from your Home Screen, then come back here and tap Enable
              </span>
            </li>
          </ol>
          <Button onClick={() => setShowInstallSteps(false)}>Got it</Button>
        </div>
      </Modal>
    </>
  );
}
