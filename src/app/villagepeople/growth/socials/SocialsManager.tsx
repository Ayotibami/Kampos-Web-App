"use client";

import { useState } from "react";
import { WeeklyStatsSection } from "./WeeklyStatsSection";
import { ContentLogSection } from "./ContentLogSection";
import { SocialsAnalytics } from "./SocialsAnalytics";
import { BroadcastsIconFill } from "@/components/ui/icons";

type Tab = "weekly" | "content";

export function SocialsManager() {
  const [tab, setTab] = useState<Tab>("weekly");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <BroadcastsIconFill className="h-6 w-6 text-brand" />
          Socials
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          Manual entry for TikTok/Instagram/X/WhatsApp channel numbers — Kampos has no first-party analytics for
          these platforms, so this is the source of truth for them.
        </p>
      </div>

      <SocialsAnalytics />

      <div>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Manual entry</h2>
        <div className="flex gap-1.5 rounded-full bg-line/15 p-1">
          {(
            [
              ["weekly", "Weekly stats"],
              ["content", "Content log"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-full px-4 py-2 font-nunito text-sm font-bold transition ${
                tab === key ? "bg-surface text-brand shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "weekly" ? <WeeklyStatsSection /> : <ContentLogSection />}
      </div>
    </div>
  );
}
