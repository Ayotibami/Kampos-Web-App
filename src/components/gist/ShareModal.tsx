"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LinkIconFill, XLogoFill, WhatsappLogoFill, FacebookLogoFill, Check } from "@/components/ui/icons";

/**
 * Desktop fallback for sharing — mobile gets the OS's own native share
 * sheet (navigator.share, see GistCard's handleShare), which already lists
 * whatever's installed (WhatsApp, Instagram, X, ...) without needing any
 * of this. Desktop browsers mostly don't implement navigator.share at all,
 * so this is the explicit alternative: copy-link plus the handful of
 * platforms that support a plain share-intent URL. Instagram deliberately
 * has no button here — it has no public "share this link" URL scheme at
 * all, unlike every platform below.
 */
export function ShareModal({
  open,
  onClose,
  url,
  text,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  text: string;
  /** Fired once a share actually goes out — a platform link opened, or a
   * successful copy-link — with a short platform label for analytics. */
  onShared?: (platform: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShared?.("copy_link");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing more to do here */
    }
  };

  const targets = [
    {
      label: "WhatsApp",
      platform: "whatsapp",
      icon: <WhatsappLogoFill size={22} weight="fill" />,
      href: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
      className: "bg-[#25D366]",
    },
    {
      label: "X",
      platform: "x",
      icon: <XLogoFill size={20} weight="fill" />,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      className: "bg-black",
    },
    {
      label: "Facebook",
      platform: "facebook",
      icon: <FacebookLogoFill size={22} weight="fill" />,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      className: "bg-[#1877F2]",
    },
  ];

  return (
    <Modal open={open} onClose={onClose}>
      <div className="rounded-3xl bg-surface-2 p-6 shadow-2xl">
        <h2 className="mb-4 text-center font-poppins text-base font-bold text-ink">Share this gist</h2>
        <div className="flex items-center justify-center gap-4">
          {targets.map((t) => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onShared?.(t.platform)}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm ${t.className}`}
              >
                {t.icon}
              </span>
              <span className="font-poppins text-xs text-muted">{t.label}</span>
            </a>
          ))}
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand/[0.07] px-4 py-2.5 font-poppins text-sm font-semibold text-brand transition hover:bg-brand/[0.12]"
        >
          {copied ? <Check className="h-4 w-4" /> : <LinkIconFill size={16} weight="fill" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </Modal>
  );
}
