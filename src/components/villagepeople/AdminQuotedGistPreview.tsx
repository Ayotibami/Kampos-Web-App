"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { ShortGist } from "@/components/gist/GistCard";
import { ExpandableText, MediaBlock, SHORT_TEXT } from "@/components/gist/GistMediaGrid";
import { GistMediaOverlay } from "@/components/gist/GistMediaOverlay";
import { AlertCircle } from "@/components/ui/icons";
import { AdminPollPreview, type AdminPollShape } from "@/components/villagepeople/AdminPollPreview";
import type { GistMedia } from "@/types";

export interface AdminQuotedGistShape {
  gist_id: string;
  avitag: string;
  gist_text: string;
  color_key?: string | null;
  is_anonymous?: boolean;
  campus_tag?: string | null;
  major_tag?: string | null;
  level?: string | null;
  first_name?: string | null;
  image_url?: string | null;
  media?: GistMedia[];
  poll?: AdminPollShape | null;
}

/**
 * The nested original on a Yarn back, for every admin gist-review surface
 * (AdminGistCard/PendingPostsTab/ReportsTab) — one shared component rather
 * than three copies, same reasoning the consumer app's own QuotedGistPreview
 * (GistCard.tsx) already follows for FeedGistCard/ProfileGistCard.
 *
 * `quotedGist`: undefined/absent means this gist isn't a repost at all —
 * callers should skip rendering this component entirely rather than pass
 * that in. `null` specifically means "this WAS a repost, but the original
 * has since been deleted" (quoted_gist_id survives deletion — see
 * KamposBackend migration 0044 — precisely so this state is distinguishable
 * from "never was a repost"), and renders a "no longer available" notice
 * instead of the usual identity/content.
 *
 * Real, unredacted identity even for an anonymous quoted gist — this whole
 * admin surface never redacts (see AdminGistCard's own doc on is_anonymous),
 * and that applies just as much to whoever's gist got quoted as it does to
 * the top-level poster. Poll renders via the same read-only AdminPollPreview
 * AdminGistCard's own top-level poll uses — QUOTED_GIST_COLUMN's `poll` key
 * is shaped identically (no `my_vote_option_id`, since QUOTED_GIST_JOIN is
 * always called with a null viewer param on admin surfaces).
 */
export function AdminQuotedGistPreview({ quotedGist }: { quotedGist: AdminQuotedGistShape | null }) {
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);

  if (!quotedGist) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-line/60 bg-brand/[0.03] p-3">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-faint" />
        <p className="font-nunito text-xs italic text-faint">
          The gist this was quoting is no longer available.
        </p>
      </div>
    );
  }

  const hasMedia = !!quotedGist.media?.length;
  const hasPoll = !!quotedGist.poll;
  const short = (quotedGist.gist_text?.length ?? 0) < SHORT_TEXT && !hasMedia && !hasPoll;

  return (
    <div className="mt-2 rounded-2xl border border-line/60 bg-brand/[0.03] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
          <Avatar src={quotedGist.image_url} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-nunito text-xs font-semibold text-ink">
              {quotedGist.first_name || `@${quotedGist.avitag}`}
            </span>
            <span className="shrink-0 font-nunito text-[11px] text-faint">@{quotedGist.avitag}</span>
          </div>
          {(quotedGist.campus_tag || quotedGist.major_tag || quotedGist.level) && (
            <p className="truncate font-nunito text-[11px] text-faint">
              {[quotedGist.campus_tag, quotedGist.major_tag, quotedGist.level].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {quotedGist.is_anonymous && (
          <span className="shrink-0 rounded-full bg-[#2a1854]/10 px-2 py-0.5 font-nunito text-[10px] font-bold text-[#6c3fd6]">
            Anonymous
          </span>
        )}
      </div>
      <div className="mt-2">
        {short ? (
          <ShortGist text={quotedGist.gist_text} colorKey={quotedGist.color_key ?? null} fallbackSeed={quotedGist.gist_id} />
        ) : (
          quotedGist.gist_text && <ExpandableText text={quotedGist.gist_text} />
        )}
        {hasPoll && <AdminPollPreview poll={quotedGist.poll!} />}
        {hasMedia && (
          <MediaBlock media={quotedGist.media!} onOpenOverlay={setOverlayIndex} overlayOpen={overlayIndex !== null} />
        )}
      </div>
      <AnimatePresence>
        {hasMedia && overlayIndex !== null && (
          <GistMediaOverlay media={quotedGist.media!} startIndex={overlayIndex} onClose={() => setOverlayIndex(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
