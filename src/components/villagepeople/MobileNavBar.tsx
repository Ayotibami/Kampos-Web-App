"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Menu, SettingsIconFill, X } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AccountInitialAvatar } from "@/components/villagepeople/AccountInitialAvatar";
import { getNavGroups, isNavItemActive, type NavItem } from "./navGroups";

/**
 * Mobile nav for /villagepeople — VillagePeopleRail is `hidden` below `md`
 * (a persistent 256px side rail has nowhere to live on a phone screen), so
 * without this, a phone had NO way to move between admin sections at all
 * beyond typing URLs directly. A top bar (hamburger + title) plus a
 * slide-over drawer, built on the same primitives Modal.tsx already uses
 * (portal to document.body, backdrop fade + click-to-dismiss, Escape key,
 * body-scroll lock) — but as its own small component rather than a new
 * Modal variant, since Modal's two variants ("center", bottom "sheet")
 * don't cover a side drawer, and this codebase's own precedent
 * (CommentSheet.tsx being its own component rather than a Modal variant)
 * is to give a one-off shape its own file instead of growing Modal's
 * variant matrix indefinitely.
 *
 * Shares navGroups.ts with VillagePeopleRail — same links, same order,
 * same active-state logic — so desktop and mobile can never drift apart.
 *
 * The top bar itself is fixed + show-on-scroll-up (Instagram-style, the
 * exact algorithm ProfileView.tsx's own header already uses): hides while
 * scrolling down through a long list, reappears on any scroll-up or at the
 * very top, so the hamburger is always reachable within a scroll-up
 * gesture rather than requiring a scroll all the way back to the top.
 */
export function MobileNavBar({ isKing, email }: { isKing: boolean; email?: string }) {
  const pathname = usePathname();
  const onMyAccount = pathname === "/villagepeople/me";
  const [open, setOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const groups = getNavGroups(isKing);

  // Show-on-scroll-up header, same algorithm ProfileView.tsx's own header
  // already uses (hides past a 4px cumulative scroll-down, reappears on a
  // 4px cumulative scroll-up or at the very top) — so the hamburger stays
  // reachable without scrolling all the way back up. Plain `window.scrollY`
  // is the right (and only) signal here: this bar only renders below `md`,
  // where AppShell's "panel" variant has no height lock (only `md:h-dvh`),
  // so mobile always scrolls the actual window, never an internal pane —
  // unlike ProfileView.tsx, which also has to watch an inner scroll
  // container for its desktop case.
  useEffect(() => {
    let baseline = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 0) {
        setHeaderVisible(true);
        baseline = y;
        return;
      }
      const delta = y - baseline;
      if (delta <= -4) {
        setHeaderVisible(true);
        baseline = y;
      } else if (delta >= 4) {
        setHeaderVisible(false);
        baseline = y;
      }
      // Within ±4px of the last change: hold state AND hold the baseline
      // so movement keeps accumulating (slow-scroll-up fix).
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-close on navigation — covers every way a link could be activated
  // (click, keyboard, browser back/forward), not just an explicit onClick
  // handler on each link. This is the standard "reset transient UI state
  // when a key value changes" case React's own docs endorse effects for —
  // not the cascading-render footgun the rule targets, since it only
  // fires when pathname itself actually changes, never on every render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 font-nunito text-base transition ${
          active ? "bg-brand/10 font-semibold text-brand" : "font-medium text-ink hover:bg-brand/5"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" weight={active ? "bold" : "regular"} />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* Spacer — reserves the header's own height (60px, matching
          ProfileView.tsx's own `pt-[60px]` header-height convention) in
          normal document flow, since the header itself below is `fixed`
          (out of flow, so it can hide/reveal via transform without
          content shifting to fill the gap while it's hidden). */}
      <div className="h-[60px] shrink-0 md:hidden" aria-hidden />
      <div
        className={`fixed inset-x-0 top-0 z-30 flex shrink-0 items-center gap-2.5 border-b border-line/70 bg-surface px-4 py-3 transition-transform duration-300 md:hidden ${
          headerVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <Link
          href="/feed"
          aria-label="Back to Kampos"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 truncate font-nunito text-lg font-extrabold text-ink">Village People</h1>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[1000] md:hidden" role="dialog" aria-modal>
                <motion.div
                  className="absolute inset-0 bg-brand-ink/50 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 flex w-[82vw] max-w-80 flex-col bg-surface p-5"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", stiffness: 320, damping: 32 }}
                >
                  <div className="mb-6 flex shrink-0 items-center justify-between">
                    <h2 className="font-nunito text-lg font-extrabold text-ink">Village People</h2>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close menu"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
                    >
                      <X className="h-5 w-5" />
                    </button>
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
                    {/* Same "My Account" footer shortcut as the desktop
                        rail — just the avatar, no label. See
                        VillagePeopleRail.tsx's own doc comment. */}
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
                    {/* Same "jump to the main app's Settings" shortcut as
                        the desktop rail's own footer — see its doc comment. */}
                    <Link
                      href="/settings"
                      aria-label="Settings"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
                    >
                      <SettingsIconFill className="h-5 w-5" weight="regular" />
                    </Link>
                    <ThemeToggle />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
