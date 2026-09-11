/**
 * Read-only poll preview for the admin panel — an admin reviewing a gist
 * needs to see WHAT was actually posted (the options, and how voting is
 * going) to make a real moderation call, but voting itself isn't something
 * an admin does from here. Unlike the consumer-facing PollBlock
 * (src/components/gist/PollBlock.tsx), this:
 *  - Is never interactive — plain rows, not buttons, no vote action wired
 *    up at all (the type this takes, AdminPollShape, doesn't even carry a
 *    `my_vote_option_id` — see its own doc).
 *  - Always shows counts/percentages, never hidden-until-you-vote — the
 *    whole point here is assessing real activity at a glance, not the
 *    consumer app's "don't bias the vote" concern, which doesn't apply to
 *    a reviewer who isn't voting anyway.
 * Matches BreakdownBar's own styling vocabulary (rounded-full track on
 * bg-line/40, font-nunito text-[11px] labels, bold ink for values) so it
 * reads as native to this panel rather than an imported consumer widget,
 * without actually reusing BreakdownBar itself — that component compresses
 * everything into one stacked bar + legend, which suits a handful of short
 * category labels (account statuses, profile types) but would crush
 * multiple full poll-option sentences down to unreadable slivers. A poll
 * needs each option readable on its own row.
 */
export interface AdminPollShape {
  poll_id: string;
  options: Array<{ option_id: string; option_text: string; votes_count: number }>;
}

export function AdminPollPreview({ poll }: { poll: AdminPollShape }) {
  const total = poll.options.reduce((sum, o) => sum + o.votes_count, 0);

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-line/60 bg-brand/[0.03] p-3">
      <span className="font-nunito text-[10px] font-bold uppercase tracking-wide text-faint">
        Poll · {total.toLocaleString()} {total === 1 ? "vote" : "votes"}
      </span>
      {poll.options.map((option) => {
        const pct = total > 0 ? Math.round((option.votes_count / total) * 100) : 0;
        return (
          <div key={option.option_id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-nunito text-xs text-ink">{option.option_text}</span>
              <span className="shrink-0 font-nunito text-xs font-bold text-faint tabular-nums">
                {option.votes_count.toLocaleString()} · {pct}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/40">
              <div className="h-full rounded-full bg-brand/60" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
