import Image from "next/image";
import KappyPhone from "@/assets/illustrations/KappyPhone.webp";
import { GhostCard } from "./GhostCard";

/**
 * A frozen, non-animated frame of PhoneKappyOrbit (the onboarding
 * carousel's second slide) — same Kappy-on-his-phone artwork, same ghost
 * cards peeking around him, just held at one fixed pose instead of
 * continuously bobbing/drifting. Built for small, static contexts like a
 * modal (AuthPromptModal, InstallPrompt) where a full looping animation
 * would be distracting rather than delightful, and where there's nowhere
 * near enough room for the carousel's real desktop card treatment anyway.
 */
const CARDS = [
  { top: "-6%", left: "-10%", width: "34%", rotate: -6, tail: false, colorSeed: "a" },
  { top: "-4%", right: "-10%", width: "32%", rotate: 5, tail: false, colorSeed: "d" },
  { bottom: "2%", left: "-12%", width: "32%", rotate: 4, tail: true, colorSeed: "g" },
  { bottom: "0%", right: "-8%", width: "30%", rotate: -4, tail: true, colorSeed: "j" },
] as const;

export function StaticPhoneOrbit({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-3xl">
        <Image src={KappyPhone} alt="" fill sizes="200px" className="object-cover object-top" />
      </div>
      {CARDS.map((card, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: "top" in card ? card.top : undefined,
            bottom: "bottom" in card ? card.bottom : undefined,
            left: "left" in card ? card.left : undefined,
            right: "right" in card ? card.right : undefined,
            width: card.width,
            transform: `rotate(${card.rotate}deg)`,
          }}
        >
          <GhostCard tail={card.tail} colorSeed={card.colorSeed} />
        </div>
      ))}
    </div>
  );
}
