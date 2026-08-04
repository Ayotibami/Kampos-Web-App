"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import KappyPhone from "@/assets/illustrations/KappyPhone.png";
import { MiniGistCard } from "./MiniGistCard";
import { MiniCommentCard } from "./MiniCommentCard";

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

// Positioned in toward Kappy (not pushed out past the edges) so the cards
// read as overlaying him, not just floating beside him in empty space —
// fine for them to clip off the container's own edges since they're meant
// to spill slightly past his silhouette, just not stack up over his face:
// there's a deliberate vertical gap down the middle (his head/phone) with
// 3 cards down each side instead.
const CARD_DEFS: CardDef[] = [
  { top: "-2%", left: "2%", width: "40%", amp: 10, duration: 4.4, delay: 0.2, rotate: -4, kind: "post" },
  { top: "0%", left: "60%", width: "38%", amp: 9, duration: 4.8, delay: 0.6, rotate: 5, kind: "post" },
  { top: "36%", left: "72%", width: "38%", amp: 12, duration: 4.1, delay: 1, rotate: -5, kind: "comment" },
  { top: "34%", left: "-6%", width: "38%", amp: 11, duration: 4.6, delay: 0.9, rotate: 4, kind: "comment" },
  { top: "72%", left: "0%", width: "40%", amp: 10, duration: 5, delay: 0.4, rotate: 4, kind: "post" },
  { top: "74%", left: "58%", width: "38%", amp: 9, duration: 4.3, delay: 0.7, rotate: -4, kind: "post" },
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

/**
 * Kappy on his phone, orbited by 6 small cards built from the app's real
 * GistCard/CommentPanel styling — 4 posts, 2 comments — each continuously
 * bobbing on its own independent loop (same mechanic HeroOrbit uses on the
 * marketing site: everything alive at once, nothing cycling in/out on a
 * timer, since a slide is only on screen briefly).
 */
export function PhoneKappyOrbit({ className = "" }: { className?: string }) {
  let postIdx = 0;
  let commentIdx = 0;

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

      {CARD_DEFS.map((card, i) => {
        const isPost = card.kind === "post";
        const post = isPost ? POSTS[postIdx++] : null;
        const comment = !isPost ? COMMENTS[commentIdx++] : null;
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
            {post && <MiniGistCard {...post} />}
            {comment && <MiniCommentCard {...comment} />}
          </motion.div>
        );
      })}
    </div>
  );
}
