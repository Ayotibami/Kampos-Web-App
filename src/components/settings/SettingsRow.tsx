import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLinkIconFill } from "@/components/ui/icons";

interface SettingsRowProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  href: string;
  /** Opens in a new tab (the marketing site's legal/support pages) instead
   * of navigating this app away. */
  external?: boolean;
  /** "row" (default): compact, used by the Settings hub's mobile list.
   * "card": bordered/padded tile with a trailing external-link mark — used
   * by App & Legal / Feedback & Support, whose few items looked sparse and
   * unfinished as plain thin rows in the wider desktop content pane. */
  variant?: "row" | "card";
}

/** One tappable destination — icon, title, subtitle — used by the Settings
 * hub and the App & Legal / Feedback & Support subpages alike. */
export function SettingsRow({
  icon,
  title,
  subtitle,
  href,
  external = false,
  variant = "row",
}: SettingsRowProps) {
  const isCard = variant === "card";

  const content = (
    <>
      <span
        className={`flex shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand ${
          isCard ? "h-12 w-12" : "h-11 w-11"
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-nunito text-[15px] font-semibold text-ink">{title}</span>
        <span className={`font-nunito text-xs text-muted ${isCard ? "" : "truncate"}`}>{subtitle}</span>
      </span>
      {isCard && <ExternalLinkIconFill className="h-4 w-4 shrink-0 text-faint" weight="bold" />}
    </>
  );

  const className = isCard
    ? "flex items-center gap-3.5 rounded-2xl border border-line/70 bg-surface-2/60 p-4 transition hover:border-brand/40 hover:bg-brand/5 active:scale-[0.99]"
    : "flex items-center gap-3.5 rounded-2xl px-1 py-2 transition hover:bg-brand/5 active:scale-[0.99]";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
