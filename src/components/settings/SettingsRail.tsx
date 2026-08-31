"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoutAction } from "@/components/settings/LogoutAction";
import { KornerLink } from "@/components/settings/KornerLink";
import { Wordmark } from "@/components/brand/Wordmark";
import {
  ArrowLeft,
  ProfileIconFill,
  AccountIconFill,
  LegalIconFill,
  SupportIconFill,
  XLogoFill,
  InstagramLogoFill,
} from "@/components/ui/icons";
import { CONTACT } from "@/lib/contact";
import { runGuardedNavigation } from "@/stores/unsavedChangesStore";
import { useAuthStore } from "@/stores/authStore";

const NAV_ITEMS = [
  { href: "/settings/profile", label: "Profile", icon: ProfileIconFill },
  { href: "/settings/account", label: "Account", icon: AccountIconFill },
  { href: "/settings/legal", label: "Legal", icon: LegalIconFill },
  { href: "/settings/support", label: "Support", icon: SupportIconFill },
] as const;

/**
 * Desktop-only persistent side rail (hidden on mobile — phones keep the
 * original single-screen-at-a-time navigation with a back arrow on each
 * page). This is what makes Settings a real two-pane desktop page instead
 * of a scaled-up phone screen: the rail itself is the navigation, so
 * clicking between sections never needs a "back" affordance, and stays
 * mounted across navigation (Next's layout doesn't remount it) so the
 * highlighted section updates instead of the whole rail flashing.
 */
export function SettingsRail() {
  const pathname = usePathname();
  const router = useRouter();
  // /profile no longer exists — a profile lives at the root (/avitag), own
  // or anyone else's. Falls back to /feed if avitag hasn't loaded yet.
  const avitag = useAuthStore((s) => s.avitag);
  const backHref = avitag ? `/${avitag}` : "/feed";

  return (
    <nav className="hidden w-64 shrink-0 flex-col border-r border-line/70 p-6 md:flex">
      <div className="mb-6 flex items-center gap-2.5">
        <Link
          href={backHref}
          aria-label="Back to Kampos"
          onClick={(e) => {
            e.preventDefault();
            runGuardedNavigation(() => router.push(backHref));
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-nunito text-xl font-extrabold text-ink">Settings</h1>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                runGuardedNavigation(() => router.push(item.href));
              }}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 font-nunito text-sm transition ${
                active
                  ? "bg-brand/10 font-semibold text-brand"
                  : "font-medium text-ink hover:bg-brand/5"
              }`}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" weight={active ? "bold" : "regular"} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-line/70 pt-4">
        {/* No "Follow us" label — self-explanatory enough not to need one,
            and this is a hard-viewport-height panel with no scroll of its
            own, so every bit of vertical height this footer doesn't need
            matters. Korner gets its own line below rather than sharing this
            row — same reasoning, just a separate link rather than a social
            icon, so grouping it in with X/Instagram read as miscategorized. */}
        <div className="flex items-center justify-center gap-4">
          {/* Muted, not real brand colors — unlike Korner, these two are
              recognizable by shape alone, so color here was just adding
              noise next to Korner/Kampos's own colors, not real identity
              information. */}
          <a
            href={CONTACT.x}
            target="_blank"
            rel="noreferrer"
            aria-label="Kampos on X"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
          >
            <XLogoFill className="h-5 w-5" weight="regular" />
          </a>
          <a
            href={CONTACT.instagram}
            target="_blank"
            rel="noreferrer"
            aria-label="Kampos on Instagram"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
          >
            <InstagramLogoFill className="h-5 w-5" weight="regular" />
          </a>
        </div>

        <KornerLink large />

        <LogoutAction fullWidth />

        {/* Brand signature closing out the rail's footer — the header up
            top says "Settings" (with a back arrow to Kampos), not "Kampos"
            itself, so this is the one place the actual wordmark shows up
            here. Sized well below the header's own text-xl on purpose —
            a quiet signature, not a second competing brand moment. */}
        <div className="space-y-1 text-center">
          <Wordmark accentClassName="text-brand" className="text-sm" />
          <p className="font-nunito text-xs text-muted">Version 1.0.0</p>
          <p className="font-nunito text-[11px] text-faint">From Ayoti</p>
        </div>
      </div>
    </nav>
  );
}
