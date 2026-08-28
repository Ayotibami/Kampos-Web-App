"use client";

/**
 * Setup-complete celebration — replaces SuccessModal for this one moment
 * (see AvitagStep.tsx). A real milestone, not a routine confirmation, so
 * it gets its own richer treatment: Kappy, a confetti burst, and the full
 * welcome copy — what Kampos actually is, one line each for Gist/Amebo/
 * trends, the community guideline in its own quieter box, and a footnote
 * pointing at Settings.
 *
 * Explicit light colors throughout, not the theme-aware surface/ink/muted
 * tokens — the setup-profile route is one of the ones layout.tsx's inline
 * theme-init script deliberately excludes from dark mode (nothing in this
 * flow lets you toggle theme yet), so this is guaranteed to render on a
 * light background regardless of the visitor's OS/system preference.
 * Hardcoding light values here is a promise, not a workaround: if setup
 * ever does get theme support, this should be revisited deliberately
 * rather than silently inheriting whatever `dark:` classes happen to do
 * elsewhere.
 */

import Image from "next/image";
import { motion } from "framer-motion";
import { Modal } from "@/components/ui/Modal";
import KappyWaving from "@/assets/illustrations/KappyWaving.webp";

const CONFETTI = [
  { color: "#165abf", tx: -60, ty: -50, rot: 140, delay: 0.05 },
  { color: "#ffc107", tx: 55, ty: -55, rot: -120, delay: 0.1 },
  { color: "#6eed94", tx: -70, ty: -10, rot: 200, delay: 0.02 },
  { color: "#2f74e0", tx: 68, ty: -5, rot: -80, delay: 0.15 },
  { color: "#ffc107", tx: -30, ty: -75, rot: 60, delay: 0.12 },
  { color: "#165abf", tx: 30, ty: -78, rot: -160, delay: 0.08 },
  { color: "#6eed94", tx: 0, ty: -85, rot: 100, delay: 0.18 },
  { color: "#ffc107", tx: -85, ty: -35, rot: -40, delay: 0.2 },
] as const;

const FEATURES = [
  <>
    Post a <b>Gist</b>
    {" "}to share what&apos;s really going on around your campus.
  </>,
  <>
    Tap <b>Amebo</b>
    {" "}to see what&apos;s popping on other campuses too.
  </>,
  "Catch the latest updates, trends, and drama — first, before anybody.",
];

export function WelcomeSheet({ open, onConfirm }: { open: boolean; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onConfirm} dismissable={false} variant="sheet" desktopCenter>
      <div className="rounded-t-[26px] bg-white px-6 pb-6 pt-3.5 md:rounded-[26px]">
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-[#dcdbde] md:hidden" />

        <div className="relative mb-1 flex justify-center">
          {CONFETTI.map((c, i) => (
            <motion.span
              key={i}
              className="absolute top-[40%] left-1/2 h-1.5 w-1.5 rounded-[2px]"
              style={{ backgroundColor: c.color }}
              initial={{ opacity: 1, x: "-50%", y: "-50%", scale: 0.6, rotate: 0 }}
              animate={{
                opacity: 0,
                x: `calc(-50% + ${c.tx}px)`,
                y: `calc(-50% + ${c.ty}px)`,
                scale: 1,
                rotate: c.rot,
              }}
              transition={{ duration: 1, delay: c.delay, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
          <Image
            src={KappyWaving}
            alt=""
            priority
            className="relative z-10 h-[88px] w-auto drop-shadow-[0_8px_16px_rgba(22,90,191,0.25)]"
          />
        </div>

        <h2 className="mb-3.5 text-center font-nunito text-[19px] font-black tracking-tight text-[#171a1f]">
          Welcome to Kampos!
        </h2>

        <div className="mb-3.5 flex flex-col gap-2">
          {FEATURES.map((text, i) => (
            <p
              key={i}
              className="m-0 font-nunito text-[13px] leading-snug text-[#171a1f] [&_b]:font-extrabold [&_b]:text-brand"
            >
              {text}
            </p>
          ))}
        </div>

        <div className="mb-3 rounded-xl bg-[#eaf1fc] px-3 py-2.5">
          <p className="m-0 font-nunito text-[11.5px] leading-snug text-[#6e6d72]">
            Keep the space safe — no unverified gist, no wahala. Report anything that breaks the rules or just
            doesn&apos;t sit right with you.
          </p>
        </div>

        <p className="mb-4 text-center font-nunito text-[10.5px] leading-snug text-[#6e6d72]">
          You can always update your profile or account later in Settings.
        </p>

        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-full bg-brand py-3.5 font-nunito text-sm font-extrabold text-white shadow-[0_10px_24px_-8px_rgba(22,90,191,0.55)] transition active:scale-[0.98]"
        >
          Oya, let&apos;s gist
        </button>
      </div>
    </Modal>
  );
}
