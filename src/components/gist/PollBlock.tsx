"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle } from "@/components/ui/icons";
import { useGistStore } from "@/stores/gistStore";
import { requireAuth } from "@/lib/requireAuth";
import { compactNumber } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import type { GistPoll } from "@/types";

/**
 * A gist's poll, rendered in place of its media — MediaBlock and this are
 * mutually exclusive on a gist, same as the backend enforces at creation
 * time (see schemas/gist.ts). Results stay hidden until the viewer votes
 * (no counts, no percentages, just plain tappable options), then every
 * bar animates its fill in at once — same "show the real result the
 * instant you're allowed to see it" moment a reaction burst already goes
 * for elsewhere in this app, just expressed as a width tween instead of a
 * Lottie pop.
 *
 * Shared by the feed and the profile page, same reasoning as MediaBlock —
 * one poll component, not two near-identical copies.
 */
export function PollBlock({ gistId, poll }: { gistId: string; poll: GistPoll }) {
  const votePoll = useGistStore((s) => s.votePoll);

  // Split in two, deliberately — this is the actual fix for "my vote
  // disappears a few seconds later" / "changing my vote reverts back to
  // the old one":
  //
  // `options` (the live counts) SHOULD follow every fresh `poll` prop —
  // that's what lets someone ELSE's vote animate in while you're looking
  // at this same poll, over the live WS broadcast (see gistStore's
  // poll:voted subscription). That broadcast fires on ANY vote, by ANYONE,
  // and carries fresh counts but deliberately no `my_vote_option_id` at
  // all (a broadcast has no single "viewer" to compute that for — see the
  // broadcast handler's own doc). FeedContent/ProfileView's handlers for
  // it just spread `{...g.poll, options}`, preserving whatever
  // `my_vote_option_id` their OWN local gist list already had — which,
  // critically, was never actually updated with YOUR vote in the first
  // place (this component's old version only ever told the global store,
  // not the page's own local list). So the instant anyone else voted and
  // that object's identity changed, the old code below resynced `myVote`
  // straight from that stale/null value — silently reverting a vote that
  // had only ever existed in this component's own local state.
  //
  // `myVote` fixes that by being seeded from the prop once (mount, or a
  // genuinely different poll landing in this slot — see the poll_id check
  // below) and NEVER re-derived from `poll.my_vote_option_id` on a plain
  // options refresh afterward. This viewer already knows their own pick
  // better than a broadcast that was never even told what it was.
  const [pollId, setPollId] = useState(poll.poll_id);
  const [options, setOptions] = useState(poll.options);
  const [myVote, setMyVote] = useState(poll.my_vote_option_id);
  if (poll.poll_id !== pollId) {
    // A genuinely different poll now occupies this slot (e.g. the list
    // re-fetched and a different gist landed here) — reset everything.
    setPollId(poll.poll_id);
    setOptions(poll.options);
    setMyVote(poll.my_vote_option_id);
  } else if (options !== poll.options) {
    // Same poll, fresh counts only — adopt those, leave myVote alone.
    setOptions(poll.options);
  }

  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string>();

  const totalVotes = options.reduce((sum, o) => sum + o.votes_count, 0);
  const hasVoted = myVote !== null;

  const handleVote = async (optionId: string) => {
    if (!requireAuth("vote on polls")) return;
    if (voting || optionId === myVote) return;
    setError(undefined);
    setVoting(true);
    const priorOptions = options;
    const priorMyVote = myVote;
    setMyVote(optionId);
    setOptions(
      options.map((o) => {
        if (o.option_id === optionId) return { ...o, votes_count: o.votes_count + 1 };
        if (o.option_id === priorMyVote) return { ...o, votes_count: Math.max(0, o.votes_count - 1) };
        return o;
      }),
    );
    // Fires right alongside the optimistic fill above, not after the
    // network round trip — same reasoning every reaction in the app
    // already follows.
    playSound("pop");
    try {
      await votePoll(gistId, optionId);
    } catch {
      setMyVote(priorMyVote);
      setOptions(priorOptions);
      setError("Couldn't vote — try again");
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {options.map((option) => {
        const pct = totalVotes > 0 ? Math.round((option.votes_count / totalVotes) * 100) : 0;
        const isMine = option.option_id === myVote;
        return (
          <motion.button
            key={option.option_id}
            type="button"
            onClick={() => handleVote(option.option_id)}
            disabled={voting}
            whileTap={{ scale: 0.97 }}
            className={`relative w-full overflow-hidden rounded-2xl px-4 py-3 text-left ring-1 transition-colors ${
              isMine ? "ring-2 ring-brand" : "ring-line/50"
            }`}
          >
            {/* Track — the same neutral "tappable pill" look the feed's
                own tab buttons already use for an unselected option. */}
            <div className="absolute inset-0 bg-brand/[0.06]" />
            {/* Fill — only animates in once a vote has actually landed
                (hasVoted), width tweening from 0 to the real percentage
                every time totalVotes changes, so a later viewer casting
                their own vote sees everyone else's bars react too, not
                just their own. */}
            <AnimatePresence>
              {hasVoted && (
                <motion.div
                  className={`absolute inset-y-0 left-0 ${isMine ? "bg-brand/30" : "bg-brand/10"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  exit={{ width: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>
            <div className="relative z-10 flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 font-nunito text-sm font-semibold text-ink">
                <AnimatePresence initial={false}>
                  {isMine && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      className="flex shrink-0 items-center"
                    >
                      <CheckCircle size={16} strokeWidth={2.5} className="text-brand" />
                    </motion.span>
                  )}
                </AnimatePresence>
                <span className="truncate">{option.option_text}</span>
              </span>
              {hasVoted && (
                <span className="shrink-0 font-nunito text-sm font-bold text-brand tabular-nums">
                  {pct}%
                </span>
              )}
            </div>
          </motion.button>
        );
      })}
      <div className="flex items-center justify-between px-1">
        <span className="font-nunito text-xs text-faint">
          {compactNumber(totalVotes)} {totalVotes === 1 ? "vote" : "votes"}
        </span>
        {error && (
          <span className="font-nunito text-xs text-danger">{error}</span>
        )}
      </div>
    </div>
  );
}
