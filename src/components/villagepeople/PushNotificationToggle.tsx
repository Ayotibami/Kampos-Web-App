"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage } from "@/lib/api";
import {
  getPushSupport,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSupport,
} from "@/lib/pushSubscription";

/**
 * Opt-in for the admin-only Web Push notifications (reports, king-security
 * events, the 30-minute activity digest — see KamposBackend's webpush.service.ts).
 * Lives on /villagepeople/me since it's a per-device preference, not an
 * account-wide setting — each browser/device an admin uses has its own
 * subscription, so this card only ever reflects THIS browser's state.
 */
export function PushNotificationToggle({ onError }: { onError: (msg: string) => void }) {
  const [support, setSupport] = useState<PushSupport | "checking">("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = getPushSupport();
      setSupport(s);
      if (s === "ready") setSubscribed(await isSubscribed());
    })();
  }, []);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        await subscribeToPush();
        setSubscribed(true);
      }
      // Permission may have just changed (granted, or the browser's own
      // prompt got dismissed) — re-check rather than assume "ready" still
      // holds.
      setSupport(getPushSupport());
    } catch (err) {
      onError(apiErrorMessage(err, "Couldn't update push notifications"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-nunito text-sm font-bold text-ink">Push notifications</h2>
          <p className="mt-1 font-nunito text-xs text-muted">
            Reports, king-account security alerts, and an activity digest — delivered to this browser even
            when Kampos isn&apos;t open.
          </p>
        </div>
        {support === "ready" && (
          <Button
            variant={subscribed ? "secondary" : "primary"}
            fullWidth={false}
            className="!px-4 !py-2 text-sm"
            loading={busy}
            disabled={busy}
            onClick={handleToggle}
          >
            {subscribed ? "Disable" : "Enable"}
          </Button>
        )}
      </div>
      {support === "unsupported" && (
        <p className="rounded-xl bg-line/20 px-3 py-2 font-nunito text-xs text-muted">
          This browser doesn&apos;t support push notifications.
        </p>
      )}
      {support === "denied" && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 font-nunito text-xs text-warning">
          Notifications are blocked for this site in your browser settings — allow them there to enable this.
        </p>
      )}
    </section>
  );
}
