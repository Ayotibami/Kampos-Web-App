"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { LogoutAction } from "@/components/settings/LogoutAction";
import { KornerLink } from "@/components/settings/KornerLink";
import { useIsMobile } from "@/lib/useIsMobile";
import { useAuthStore } from "@/stores/authStore";
import {
  ProfileIconFill,
  AccountIconFill,
  LegalIconFill,
  SupportIconFill,
  XLogoFill,
  InstagramLogoFill,
} from "@/components/ui/icons";
import { CONTACT } from "@/lib/contact";

const ROWS = [
  {
    icon: <ProfileIconFill className="h-5 w-5" weight="regular" />,
    title: "Profile",
    subtitle: "Edit Profile Information",
    href: "/settings/profile",
  },
  {
    icon: <AccountIconFill className="h-5 w-5" weight="regular" />,
    title: "Account",
    subtitle: "Change passwords, Deactivate Account",
    href: "/settings/account",
  },
  {
    icon: <LegalIconFill className="h-5 w-5" weight="regular" />,
    title: "Legal",
    subtitle: "Privacy Policy, Terms & Conditions",
    href: "/settings/legal",
  },
  {
    icon: <SupportIconFill className="h-5 w-5" weight="regular" />,
    title: "Support",
    subtitle: "Report, Feature Requests, Contact Us",
    href: "/settings/support",
  },
];

/**
 * /settings root. On mobile this is the whole hub — the rows list, socials,
 * logout, version/credit — since phones have no persistent rail (see
 * SettingsHeader's docstring). On desktop, SettingsRail already covers all
 * of that navigation permanently, so landing here bounces straight to
 * Profile Settings instead — there's nothing this pane would show that the
 * rail doesn't already, so an empty "pick a section" state was just an
 * extra click for no reason.
 */
export function SettingsHub() {
  const router = useRouter();
  const isMobile = useIsMobile();
  // /profile no longer exists — a profile lives at the root (/avitag), own
  // or anyone else's. Falls back to /feed if avitag hasn't loaded yet.
  const avitag = useAuthStore((s) => s.avitag);
  const backHref = avitag ? `/${avitag}` : "/feed";

  useEffect(() => {
    if (!isMobile) router.replace("/settings/profile");
  }, [isMobile, router]);

  return (
    <div className="flex flex-1 flex-col md:hidden">
      <SettingsPageShell title="Settings" backHref={backHref}>
        <div className="flex flex-col gap-1">
          {ROWS.map((row) => (
            <SettingsRow key={row.href} {...row} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-6 pt-10">
          {/* No "Follow us" label — self-explanatory enough not to need
              one. Korner gets its own line below rather than sharing this
              row — it's a separate link, not a social icon, so grouping it
              in with X/Instagram read as miscategorized. */}
          {/* Muted, not real brand colors — unlike Korner, these two are
              recognizable by shape alone, so color here was just adding
              noise next to Korner/Kampos's own colors, not real identity
              information. */}
          <div className="flex items-center gap-4">
            <a
              href={CONTACT.x}
              target="_blank"
              rel="noreferrer"
              aria-label="Kampos on X"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
            >
              <XLogoFill className="h-5 w-5" weight="regular" />
            </a>
            <a
              href={CONTACT.instagram}
              target="_blank"
              rel="noreferrer"
              aria-label="Kampos on Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
            >
              <InstagramLogoFill className="h-5 w-5" weight="regular" />
            </a>
          </div>

          <KornerLink />

          <LogoutAction />

          <div className="space-y-1 text-center">
            <p className="font-nunito text-xs text-muted">Version 1.0.0</p>
            <p className="font-nunito text-[11px] text-faint">From Ayoti</p>
          </div>
        </div>
      </SettingsPageShell>
    </div>
  );
}
