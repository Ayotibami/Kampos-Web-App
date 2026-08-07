"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GistPreviewCard } from "./GistPreviewCard";
import { useGistStore } from "@/stores/gistStore";
import { timeAgo } from "@/lib/format";
import type { Gist, ReactionType } from "@/types";

interface PreviewPost {
  name: string;
  avitag: string;
  imageUrl?: string | null;
  time: string;
  campusTag: string;
  majorTag: string;
  text: string;
  comments: number;
  reactionCounts: Partial<Record<ReactionType, number>>;
  views: number;
  shares: number;
  colorSeed: string;
}

/** Maps a real API gist onto the same shape the sample posts use. */
function toPreviewPost(gist: Gist): PreviewPost {
  return {
    name: gist.first_name || gist.name || gist.avitag,
    avitag: gist.avitag,
    imageUrl: gist.image_url,
    time: timeAgo(gist.created_at),
    campusTag: gist.campus_tag ?? "",
    majorTag: gist.major_tag ?? "",
    text: gist.gist_text,
    comments: gist.counts?.comments_count ?? 0,
    reactionCounts: gist.counts?.reactions_by_type ?? {},
    views: gist.counts?.views_count ?? 0,
    shares: gist.counts?.shares_count ?? 0,
    colorSeed: gist.gist_id,
  };
}

// Fallback sample — shown immediately (no loading flicker) and swapped out
// the moment real gists arrive from the backend, or kept as-is if the fetch
// is slow/fails. 10 realistic student gists — real-sounding names/avitags,
// real major/campus abbreviations (matching the app's own tag convention),
// pidgin-voice banter text like the actual seeded feed content, not
// marketing-mockup copy. reactionCounts is a per-emoji breakdown (matches
// gist.counts.reactions_by_type from the real API) so the real
// ReactionButton renders proper per-emoji counts here, not a lumped total.
const SAMPLE_POSTS: PreviewPost[] = [
  {
    name: "Tobi Adewale",
    avitag: "tobi_waves",
    time: "2h",
    campusTag: "UNILAG",
    majorTag: "CSC",
    text: "Barr lecture way suppose serious, but na pulse we dey catch 😅. Lecturer dey stand there dey give real life examples from him own undergrad days, and before we know am the whole 300 level don turn into comedy show, everybody dey drop one gist or the other. Na the kind lecture wey you go still remember years later, not because of the content but because of how the whole class just vibe together for two hours straight.",
    comments: 12,
    reactionCounts: { LIKE: 14, LOVE: 9, FIRE: 18, SAD: 2, LAUGH: 5 },
    views: 210,
    shares: 4,
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
    reactionCounts: { LIKE: 20, LOVE: 12, FIRE: 24, SAD: 1, LAUGH: 6 },
    views: 340,
    shares: 7,
    colorSeed: "d",
  },
  {
    name: "Emeka Obi",
    avitag: "emeka_thecruise",
    time: "20m",
    campusTag: "UNN",
    majorTag: "MCM",
    text: "Course rep don send another meeting for 9am sharp sharp 😭. Na the fourth one this week o, and every single time na the same gist — 'we go talk am for class' na person wey no dey ever come class dey always call the meeting. I don start to suspect say na hobby for am, no be leadership again. Make somebody arrange recall election abeg 🙏",
    comments: 21,
    reactionCounts: { LIKE: 10, LOVE: 4, FIRE: 8, SAD: 9, LAUGH: 3 },
    views: 180,
    shares: 2,
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
    reactionCounts: { LIKE: 9, LOVE: 3, FIRE: 12, SAD: 4, LAUGH: 1 },
    views: 150,
    shares: 1,
    colorSeed: "j",
  },
  {
    name: "Chidinma Nwosu",
    avitag: "chidinma_naturally",
    time: "3h",
    campusTag: "UNIBEN",
    majorTag: "PHM",
    text: "NEPA don bring light for hostel and everybody dey rejoice like say na public holiday 😭🙌. Person don even bring speaker come corridor, another person dey charge like ten different phones for extension box, and the guy for room 14 don already start to iron cloth like say na tomorrow him get interview. E just show say small things dey sweet pass for hostel life, make we no lie to ourselves.",
    comments: 15,
    reactionCounts: { LIKE: 16, LOVE: 10, FIRE: 20, SAD: 2, LAUGH: 4 },
    views: 275,
    shares: 5,
    colorSeed: "b",
  },
  {
    name: "Ibrahim Sule",
    avitag: "ibrahimcodes",
    time: "45m",
    campusTag: "ABU",
    majorTag: "EEE",
    text: "GST lecturer don cancel class again, na who be the real MVP? 😂",
    comments: 18,
    reactionCounts: { LIKE: 22, LOVE: 14, FIRE: 26, SAD: 3, LAUGH: 6 },
    views: 402,
    shares: 9,
    colorSeed: "e",
  },
  {
    name: "Aisha Mohammed",
    avitag: "aisha_reads",
    time: "6h",
    campusTag: "BUK",
    majorTag: "LAW",
    text: "Constitutional law CA don shock person well well 🙏. I read that textbook cover to cover, made my own summary notes, even joined a study group for two whole weeks — and I still come out with a score wey no reach my own expectation at all. Lecturer say the class average even worse than mine sef, so I no even fit vex too much. E be like say na just to regroup and go again for the exam. God abeg.",
    comments: 8,
    reactionCounts: { LIKE: 13, LOVE: 5, FIRE: 9, SAD: 10, LAUGH: 3 },
    views: 198,
    shares: 3,
    colorSeed: "h",
  },
  {
    name: "Kelvin Okafor",
    avitag: "kelvin_dbrand",
    time: "2h",
    campusTag: "UNIZIK",
    majorTag: "BUS",
    text: "Group project WhatsApp group don turn ghost town, everybody dey type... and nothing dey send 😩",
    comments: 24,
    reactionCounts: { LIKE: 18, LOVE: 6, FIRE: 15, SAD: 14, LAUGH: 4 },
    views: 310,
    shares: 6,
    colorSeed: "c",
  },
  {
    name: "Grace Etim",
    avitag: "graceetim",
    time: "30m",
    campusTag: "UNICAL",
    majorTag: "NSC",
    text: "First anatomy practical don finish and I dey alive to tell the story 💀. Nobody warn me say the smell go stay for my hands even after I don wash am like five times, or that my lab partner go faint for the second station and I go be the one wey go call the demonstrator. Nursing school no send anybody, but I swear say I dey learn something new about myself every single week for this course.",
    comments: 11,
    reactionCounts: { LIKE: 21, LOVE: 8, FIRE: 19, SAD: 12, LAUGH: 5 },
    views: 289,
    shares: 4,
    colorSeed: "f",
  },
  {
    name: "Damilola Fash",
    avitag: "dammyfash",
    time: "4h",
    campusTag: "OAU",
    majorTag: "ARC",
    text: "Studio don turn my second hostel, models everywhere 😭✂️",
    comments: 7,
    reactionCounts: { LIKE: 11, LOVE: 7, FIRE: 10, SAD: 3, LAUGH: 2 },
    views: 165,
    shares: 2,
    colorSeed: "i",
  },
];

const HOLD_MS = 5000;

/**
 * One real GistCard-styled preview at a time, fully swiping out to the next
 * every 5s — reads as "someone swiping through the feed" one gist at a
 * time, not a scrolling ticker. Loops back to the first after the last.
 *
 * Shows the sample posts immediately (no loading flicker), then fetches the
 * 10 most recent real gists in the background and swaps to them the moment
 * they land. A slow backend isn't treated as a failure — the sample just
 * stays up until the real data arrives. An actual failure (network error,
 * empty list) retries with backoff (2s, 4s, 8s, capped at 15s) for as long
 * as the component is mounted, rather than giving up and leaving the
 * sample up forever.
 */
export function GistPreviewMarquee({ className = "" }: { className?: string }) {
  const [posts, setPosts] = useState<PreviewPost[]>(SAMPLE_POSTS);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const attempt = (delay: number) => {
      useGistStore
        .getState()
        .list({ limit: 10 })
        .then((data) => {
          if (cancelled) return;
          if (data.length === 0) {
            timer = setTimeout(() => attempt(Math.min(delay * 2, 15_000)), delay);
            return;
          }
          setPosts(data.map(toPreviewPost));
          setIndex(0);
        })
        .catch(() => {
          if (cancelled) return;
          timer = setTimeout(() => attempt(Math.min(delay * 2, 15_000)), delay);
        });
    };

    attempt(2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % posts.length), HOLD_MS);
    return () => clearInterval(id);
  }, [posts.length]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ x: "100%" }}
          animate={{ x: "0%" }}
          exit={{ x: "-100%" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute inset-0 flex items-center justify-center p-3"
        >
          <GistPreviewCard {...posts[index]} className="max-w-sm sm:max-w-md" />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
