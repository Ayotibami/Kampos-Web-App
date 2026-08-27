"use client";

/**
 * Nudges an engaged, logged-in visitor to actually put Kampos on their home
 * screen — the manifest/service worker have made that possible for a while,
 * but nothing ever told anyone it was an option, so almost nobody ever
 * found it. Mounted once in the root layout, same pattern as
 * AuthPromptModal/SessionWatcher — it renders nothing until useInstallPrompt
 * actually has a platform to show.
 */

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StaticPhoneOrbit } from "@/components/brand/StaticPhoneOrbit";
import { ShareBoxIconFill, AddToHomeIconFill } from "@/components/ui/icons";
import { useInstallPrompt } from "@/lib/pwaInstall";
import { useAuthStore } from "@/stores/authStore";

// A brand-new visitor who just landed shouldn't be interrupted by this
// before they've even seen the feed once — a short delay makes it read as
// "the app noticed you're actually using this" rather than a pop-up ambush.
const SHOW_DELAY_MS = 4000;

export function InstallPrompt() {
  const { platform, promptInstall, dismiss } = useInstallPrompt();
  const isActive = useAuthStore((s) => s.authState === "active");
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!platform || !isActive) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [platform, isActive]);

  if (!platform) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  return (
    <Modal open={visible} onClose={handleDismiss}>
      <div className="rounded-3xl bg-surface-2 p-6 text-center shadow-2xl">
        <StaticPhoneOrbit className="mx-auto mb-3 h-32 w-32" />
        <p className="mb-1.5 font-nunito text-base font-bold text-ink">
          Put Kampos on your home screen
        </p>

        {platform === "android" ? (
          <>
            <p className="mb-5 font-nunito text-sm text-muted">
              No more opening a browser and typing it in — one tap and you&apos;re
              straight in, just like a real app.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleDismiss} className="flex-1">
                Not now
              </Button>
              <Button onClick={handleInstall} loading={installing} className="flex-1">
                Install
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 font-nunito text-sm text-muted">
              iPhone no dey let apps install themselves — small small steps and
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
            </ol>
            <Button onClick={handleDismiss}>Got it</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
