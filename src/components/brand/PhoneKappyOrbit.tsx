"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import KappyPhone from "@/assets/illustrations/KappyPhone.webp";
import { MiniGistCard } from "./MiniGistCard";
import { MiniCommentCard } from "./MiniCommentCard";
import { GhostCard } from "./GhostCard";

type CardKind = "post" | "comment";

interface CardDef {
  top: string;
  left: string;
  width: string;
  amp: number;
  duration: number;
  delay: number;
  rotate: number;
  kind: CardKind;
}

// Desktop keeps real, readable mini cards — but noticeably smaller than
// the original treatment (was 38-40% width, which read as genuinely
// squeezed even on desktop's wider box). Still 3 down each side with a
// clear vertical gap through the middle for Kappy.
const DESKTOP_CARD_DEFS: CardDef[] = [
  { top: "-2%", left: "4%", width: "28%", amp: 10, duration: 4.4, delay: 0.2, rotate: -4, kind: "post" },
  { top: "0%", left: "66%", width: "26%", amp: 9, duration: 4.8, delay: 0.6, rotate: 5, kind: "post" },
  { top: "36%", left: "76%", width: "26%", amp: 12, duration: 4.1, delay: 1, rotate: -5, kind: "comment" },
  { top: "34%", left: "0%", width: "26%", amp: 11, duration: 4.6, delay: 0.9, rotate: 4, kind: "comment" },
  { top: "74%", left: "6%", width: "28%", amp: 10, duration: 5, delay: 0.4, rotate: 4, kind: "post" },
  { top: "76%", left: "64%", width: "26%", amp: 9, duration: 4.3, delay: 0.7, rotate: -4, kind: "post" },
];

// Mobile swaps the real cards for small abstract shapes (see GhostCard) —
// on a narrow, near-square box, even the shrunk-down desktop cards above
// still read as too much and end up covering Kappy's face; a shape you
// only glance at doesn't need to be legible to read as "a gist card."
const MOBILE_CARD_DEFS: CardDef[] = [
  { top: "-4%", left: "0%", width: "22%", amp: 8, duration: 4.4, delay: 0.2, rotate: -4, kind: "post" },
  { top: "-2%", left: "78%", width: "20%", amp: 7, duration: 4.8, delay: 0.6, rotate: 5, kind: "post" },
  { top: "40%", left: "84%", width: "20%", amp: 9, duration: 4.1, delay: 1, rotate: -5, kind: "comment" },
  { top: "38%", left: "-4%", width: "20%", amp: 8, duration: 4.6, delay: 0.9, rotate: 4, kind: "comment" },
  { top: "82%", left: "2%", width: "22%", amp: 8, duration: 5, delay: 0.4, rotate: 4, kind: "post" },
  { top: "84%", left: "76%", width: "20%", amp: 7, duration: 4.3, delay: 0.7, rotate: -4, kind: "post" },
];

const POSTS = [
  {
    name: "Tobi Waves",
    avitag: "tobi_waves",
    time: "2h",
    campusTag: "UNILAG",
    majorTag: "CSC",
    text: "Barr lecture way suppose serious, but na pulse we dey catch 😅",
    comments: 12,
    reactions: 48,
    views: 210,
    colorSeed: "a",
  },
  {
    name: "Fatima Bello",
    avitag: "fatimabee",
    time: "5h",
    campusTag: "UI",
    majorTag: "PSY",
    text: "E choke 🔥 make I go set my profile sharp sharp!",
    comments: 9,
    reactions: 63,
    views: 340,
    colorSeed: "d",
  },
  {
    name: "Emeka Obi",
    avitag: "emeka_thecruise",
    time: "20m",
    campusTag: "UNN",
    majorTag: "MCM",
    text: "Course rep don send another meeting for 9am sharp sharp 😭",
    comments: 21,
    reactions: 34,
    views: 180,
    colorSeed: "g",
  },
  {
    name: "Blessing Uche",
    avitag: "blessing254",
    time: "1d",
    campusTag: "UNILAG",
    majorTag: "ACC",
    text: "Hostel wifi disappear anytime deadline dey come, na spiritual 🤡",
    comments: 6,
    reactions: 29,
    views: 150,
    colorSeed: "j",
  },
] as const;

const COMMENTS = [
  {
    name: "Ada Nwosu",
    avitag: "adaeze_vibes",
    time: "1h",
    text: "Omo this one pain me too 😭",
    reactions: 7,
    reacted: true,
  },
  {
    name: "Kelvin Okafor",
    avitag: "kelvin_dbrand",
    time: "3h",
    text: "Na so them dey do us for this school 💀",
    reactions: 15,
    reacted: false,
  },
] as const;

const COLOR_SEEDS = ["a", "d", "g", "j", "b", "e"];

function CardOrbit({ defs, wrapperClassName, ghost }: { defs: CardDef[]; wrapperClassName: string; ghost: boolean }) {
  let postIdx = 0;
  let commentIdx = 0;
  return (
    <div className={wrapperClassName}>
      {defs.map((card, i) => {
        const isPost = card.kind === "post";
        const post = isPost ? POSTS[postIdx++ % POSTS.length] : null;
        const comment = !isPost ? COMMENTS[commentIdx++ % COMMENTS.length] : null;
        return (
          <motion.div
            key={i}
            className="absolute"
            style={{ top: card.top, left: card.left, width: card.width }}
            animate={{
              y: [0, -card.amp, 0, card.amp * 0.6, 0],
              x: [0, card.amp * 0.5, 0, -card.amp * 0.5, 0],
              rotate: [0, card.rotate, 0, -card.rotate, 0],
            }}
            transition={{ duration: card.duration, delay: card.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            {ghost ? (
              <GhostCard tail={!isPost} colorSeed={COLOR_SEEDS[i]} />
            ) : (
              <>
                {post && <MiniGistCard {...post} />}
                {comment && <MiniCommentCard {...comment} />}
              </>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Kappy on his phone, orbited by 6 small cards — real MiniGistCard/
 * MiniCommentCard content on desktop (shrunk from the original treatment,
 * which read as squeezed even there), swapped for small abstract shapes
 * on mobile (see GhostCard) where even the shrunk real cards still ended
 * up covering his face on a narrow, near-square box. Same bob/drift/rotate
 * mechanic either way (same mechanic HeroOrbit uses on the marketing site
 * — everything alive at once, independently looping, nothing cycling on a
 * timer since a slide is only on screen briefly).
 */
export function PhoneKappyOrbit({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Same object-cover/object-top treatment as the waving Kappy on
          slide 1, for visual consistency across slides — fills the box
          rather than letterboxing inside it. */}
      <Image
        src={KappyPhone}
        alt="Kappy checking his phone"
        fill
        priority
        sizes="(min-width: 768px) 45vw, 95vw"
        className="object-cover object-top"
      />

      <CardOrbit defs={MOBILE_CARD_DEFS} wrapperClassName="md:hidden" ghost />
      <CardOrbit defs={DESKTOP_CARD_DEFS} wrapperClassName="hidden md:block" ghost={false} />
    </div>
  );
}
