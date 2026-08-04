import { Illustration } from "@/components/brand/illustrations";
import { ReactionButton } from "@/components/gist/ReactionButton";
import {
  CommentIconFill,
  ReactionIconFill,
  ViewIconFill,
  ShareIconFill,
  DotsIconFill,
} from "@/components/ui/icons";
import { compactNumber } from "@/lib/format";
import { gistColorFor } from "@/lib/brand";
import type { ReactionType } from "@/types";

// Matches GistCard's own TAG_BASE exactly (same pill shape/uppercase/tracking).
const TAG_BASE =
  "inline-block rounded-full bg-brand/10 px-2 py-0.5 font-poppins text-[10px] uppercase tracking-wide text-brand";

// Same threshold GistCard uses to decide short colored-hero vs plain-text
// rendering — past this length real gists don't fit the bold colored block,
// so they fall back to plain justified paragraph text instead.
const SHORT_TEXT = 200;

/**
 * A real GistCard preview, mirroring the actual feed card structure exactly
 * — profile header with the three-dot menu affordance, tag pills, the same
 * short-vs-long text branching (colored hero block under SHORT_TEXT chars,
 * plain justified paragraph above it), and the full footer (comment/
 * reaction-total/view/share counts plus the real per-emoji ReactionButton)
 * — not a simplified summary. The menu button and reaction row render for
 * real but are inert here (no backend calls); this is a preview, not a
 * live card.
 */
export function GistPreviewCard({
  name,
  avitag,
  time,
  campusTag,
  majorTag,
  text,
  comments,
  reactionCounts,
  views,
  shares,
  colorSeed,
  className = "",
}: {
  name: string;
  avitag: string;
  time: string;
  campusTag: string;
  majorTag: string;
  text: string;
  comments: number;
  reactionCounts: Partial<Record<ReactionType, number>>;
  views: number;
  shares: number;
  colorSeed: string;
  className?: string;
}) {
  const totalReactions = Object.values(reactionCounts).reduce((sum, n) => sum + (n ?? 0), 0);
  const short = text.length < SHORT_TEXT;

  return (
    <div
      className={`w-full overflow-hidden rounded-2xl bg-surface-2 p-5 shadow-[0_20px_45px_-12px_rgba(9,30,66,0.45)] ring-1 ring-black/5 ${className}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
          <Illustration name="Kamill" className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          {/* nowrap, not wrap — a long name/avitag combo used to push onto
              a second line inside this narrow preview card (the real feed
              card is wide enough that it never mattered there). truncate
              on name/avitag (ellipsis) + shrink-0 on time keeps this to one
              line no matter how long the name is. */}
          <div className="flex min-w-0 flex-nowrap items-center gap-x-1 overflow-hidden">
            <span className="min-w-0 truncate font-poppins text-sm font-bold text-ink">{name}</span>
            <span className="min-w-0 truncate font-poppins text-xs text-faint">@{avitag}</span>
            <span className="shrink-0 font-poppins text-xs text-faint">· {time}</span>
          </div>
          <div className="mt-1 flex flex-nowrap items-center gap-1 overflow-hidden">
            <span className={`${TAG_BASE} shrink-0 font-bold`}>{campusTag}</span>
            <span className={`${TAG_BASE} shrink-0 font-semibold`}>{majorTag}</span>
          </div>
        </div>

        {/* Decorative menu affordance — same look as the real card's
            three-dot trigger, just inert here. */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <DotsIconFill size={13} weight="fill" />
        </div>
      </div>

      {short ? (
        <div className="mt-3 rounded-xl p-4" style={{ backgroundColor: gistColorFor(colorSeed) }}>
          <p className="font-nunito text-base font-extrabold leading-snug text-white sm:text-lg">{text}</p>
        </div>
      ) : (
        <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap pr-1 text-justify font-poppins text-xs leading-relaxed text-ink sm:text-sm [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-dark/10 hover:[&::-webkit-scrollbar-thumb]:bg-brand-dark/20">
          {text}
        </p>
      )}

      {/* flex-nowrap + a shrunk-down ReactionButton so this whole bar
          always fits on one line — the real card has room to wrap on a
          full-width feed, this preview doesn't. */}
      <div className="mt-3 flex flex-nowrap items-center justify-between gap-x-1.5 overflow-hidden border-t border-line/40 pt-2.5">
        <div className="flex shrink-0 items-center gap-1.5 text-faint">
          <span className="flex items-center gap-0.5 font-poppins text-[10px]">
            <CommentIconFill size={11} weight="regular" />
            {compactNumber(comments)}
          </span>
          <span className="flex items-center gap-0.5 font-poppins text-[10px]">
            <ReactionIconFill size={11} weight="regular" />
            {compactNumber(totalReactions)}
          </span>
          <span className="flex items-center gap-0.5 font-poppins text-[10px]">
            <ViewIconFill size={11} weight="regular" />
            {compactNumber(views)}
          </span>
          <span className="flex items-center gap-0.5 font-poppins text-[10px]">
            <ShareIconFill size={11} weight="regular" />
            {compactNumber(shares)}
          </span>
        </div>
        <div className="shrink-0 origin-right scale-75">
          <ReactionButton onReact={() => {}} counts={reactionCounts} />
        </div>
      </div>
    </div>
  );
}
