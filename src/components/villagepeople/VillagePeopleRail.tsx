"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, SettingsIconFill, KornerIconFill } from "@/components/ui/icons";
import { env } from "@/lib/env";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AccountInitialAvatar } from "@/components/villagepeople/AccountInitialAvatar";
import { getNavGroups, isNavItemActive, type NavItem } from "./navGroups";

/**
 * Desktop-only persistent side rail for /villagepeople — same "rail stays
 * mounted, only the content pane swaps" pattern as SettingsRail, but a new,
 * separate component (not a reuse/edit of SettingsRail, which is
 * settings-specific). Mobile gets its own separate nav (MobileNavBar, a
 * top bar + slide-over drawer) rather than this rail trying to also serve
 * phones — the two share the same nav data (navGroups.ts) so they can
 * never drift out of sync, but the actual chrome (persistent rail vs.
 * hamburger + drawer) is different enough to earn separate components.
 *
 * `isKing` is computed server-side (villagepeople/layout.tsx, off the same
 * resolveServerAuthState() result the admin gate itself used) and passed
 * down as a prop rather than re-derived here — hiding the "Admins" link for
 * a plain 'idiot' admin is a nicety, not the real access control; the
 * actual enforcement lives server-side on admins/page.tsx itself, since a
 * hidden link is trivially bypassed by just typing the URL.
 */
export function VillagePeopleRail({ isKing, email }: { isKing: boolean; email?: string }) {
  const pathname = usePathname();
  const groups = getNavGroups(isKing);
  const onMyAccount = pathname === "/villagepeople/me";

  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 font-nunito text-sm transition ${
          active ? "bg-brand/10 font-semibold text-brand" : "font-medium text-ink hover:bg-brand/5"
        }`}
      >
        <Icon className="h-4.5 w-4.5 shrink-0" weight={active ? "bold" : "regular"} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="hidden h-full w-64 shrink-0 flex-col border-r border-line/70 p-6 md:flex">
      {/* Header and footer are pinned (shrink-0) — only the nav-groups
          list in between scrolls. Without this, the list's own height
          (8 links across 4 groups, plus more as this section grows) could
          exceed the viewport and just push the footer — including the
          theme toggle below — off the bottom with no way to reach it,
          since the rail itself had no overflow handling of its own. */}
      <div className="mb-6 flex shrink-0 items-center gap-2.5">
        <Link
          href="/feed"
          aria-label="Back to Kampos"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-nunito text-xl font-extrabold text-ink">Village People</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="flex flex-col gap-1">
            {group.label && (
              <p className="px-3.5 pb-1 font-nunito text-[11px] font-bold uppercase tracking-wide text-faint">
                {group.label}
              </p>
            )}
            {group.items.map(renderItem)}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-line/70 pt-4">
        {/* "My Account" shortcut — just the avatar, no label. Reachable
            from every admin page without leaving the panel; lives in this
            footer (not a normal grouped nav item — see navGroups.ts) for
            the same reason the theme toggle does: this whole strip is the
            rail's "you, the admin" zone, distinct from the section links
            above it. */}
        {email && (
          <Link
            href="/villagepeople/me"
            aria-label="My Account"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
              onMyAccount ? "ring-2 ring-brand" : "hover:opacity-80"
            }`}
          >
            <AccountInitialAvatar email={email} className="h-9 w-9 text-xs" />
          </Link>
        )}
        {/* The admin panel has no settings of its own — this jumps straight
            to the main app's Settings (account/profile/legal), same
            destination the rest of Kampos uses, since an admin still needs
            to manage their own email/password/etc. without leaving via the
            back arrow and hunting for it. */}
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
        >
          <SettingsIconFill className="h-5 w-5" weight="regular" />
        </Link>
        {/* Dark mode already works for this whole section (villagepeople is
            a dark-enabled route — see ThemeRouteSync.tsx) and reuses the
            app's one existing toggle component; it just never had a way to
            be reached from inside the admin panel itself, since this
            section has no link out to Settings. This footer strip is the
            rail's own "meta/utility" zone (distinct from the nav groups
            above it via the border), so it's the one fixed, always-visible
            spot for it — same reasoning as putting it here rather than
            repeating it per-page. */}
        <ThemeToggle />
        {/* Jump to The Korner's own admin panel — a separate product an
            admin here often also needs to reach. Last in this strip, since
            it's the one link that actually leaves Kampos entirely rather
            than staying inside this app. Feather icon (lucide, not this
            file's own phosphor set below) purely as a plain, recognizable
            "external tool" glyph — no Korner brand mark is a clean fit at
            this size, so this doesn't try to be one. */}
        <a
          href={env.KORNER_ADMIN_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Open The Korner's admin panel"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
        >
          <KornerIconFill className="h-5 w-5" />
        </a>
      </div>
    </nav>
  );
}
