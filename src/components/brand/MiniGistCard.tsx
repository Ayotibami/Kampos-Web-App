import { Illustration } from "@/components/brand/illustrations";
import { CommentIconFill, ReactionIconFill, ViewIconFill } from "@/components/ui/icons";
import { gistColorFor } from "@/lib/brand";

// Matches GistCard's own TAG_BASE + CampusTag/MajorTag exactly (same pill
// shape/uppercase/tracking), just sized for this mini context.
const TAG_BASE = "inline-block rounded-full bg-brand/10 px-2 py-0.5 font-poppins uppercase tracking-wide text-brand";

/**
 * A miniature version of the real feed GistCard — same header layout
 * (avatar, name, @avitag, time, then campus + major tag pills below), same
 * colored "hero" text block (gistColorFor), same footer icon set — not an
 * invented marketing mockup.
 */
export function MiniGistCard({
  name,
  avitag,
  time,
  campusTag,
  majorTag,
  text,
  comments,
  reactions,
  views,
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
  reactions: number;
  views: number;
  colorSeed: string;
  className?: string;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-2xl bg-surface-2 p-3.5 shadow-xl ring-1 ring-black/5 ${className}`}>
      <div className="flex items-start gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
          <Illustration name="Kamill" className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 shrink truncate font-poppins text-[12px] font-bold text-ink">{name}</span>
            <span className="min-w-0 shrink truncate font-poppins text-[10px] text-faint">@{avitag}</span>
            <span className="shrink-0 font-poppins text-[10px] text-faint">· {time}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className={`${TAG_BASE} text-[9px] font-bold`}>{campusTag}</span>
            <span className={`${TAG_BASE} text-[8px] font-semibold`}>{majorTag}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 rounded-xl p-3" style={{ backgroundColor: gistColorFor(colorSeed) }}>
        <p className="font-nunito text-[13px] font-bold leading-snug text-white">{text}</p>
      </div>

      <div className="mt-2 flex items-center gap-3 border-t border-line/40 pt-1.5 text-faint">
        <span className="flex items-center gap-1 font-poppins text-[11px]">
          <CommentIconFill size={13} weight="regular" />
          {comments}
        </span>
        <span className="flex items-center gap-1 font-poppins text-[11px]">
          <ReactionIconFill size={13} weight="regular" />
          {reactions}
        </span>
        <span className="flex items-center gap-1 font-poppins text-[11px]">
          <ViewIconFill size={13} weight="regular" />
          {views}
        </span>
      </div>
    </div>
  );
}
