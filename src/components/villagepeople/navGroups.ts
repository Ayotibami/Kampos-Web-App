import {
  HQIconFill,
  AdminsIconFill,
  ModerationIconFill,
  UsersIconFill,
  AllGistsIconFill,
  ProfilesIconFill,
  AuditIconFill,
  CampusIconFill,
  BroadcastsIconFill,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof HQIconFill;
}

export interface NavGroup {
  /** Omit for a standalone item with no group header above it (HQ). */
  label?: string;
  items: NavItem[];
}

/**
 * The admin nav's structure — shared between the desktop rail
 * (VillagePeopleRail) and the mobile drawer (MobileNavBar) so the two can
 * never drift out of sync with each other. Grouped so the nav reads as a
 * structure instead of one flat list — it had grown to 8 links (6 for a
 * plain admin) with nothing visually separating "police the content" from
 * "manage the config data" from "oversight of other admins." HQ
 * deliberately stays its own standalone item at the top with no group
 * label above it — it's the landing page, not a member of any category.
 */
export function getNavGroups(isKing: boolean): NavGroup[] {
  return [
    { items: [{ href: "/villagepeople", label: "HQ", icon: HQIconFill }] },
    {
      label: "Moderate",
      items: [
        // Any admin — 'idiot' or 'king' — unlike Oversight below, which
        // stays king-only.
        { href: "/villagepeople/moderation", label: "Moderation", icon: ModerationIconFill },
        // Browse every gist regardless of status, any admin. Moderation's
        // own queues only ever show a gist while it's pending or reported;
        // once actioned it disappears from view entirely, which is exactly
        // what this screen exists to fix.
        { href: "/villagepeople/gists", label: "All Gists", icon: AllGistsIconFill },
      ],
    },
    {
      label: "Manage",
      items: [
        // Label-only rename from "Users" -> "Accounts" (route/href/component
        // names untouched) — account-centric (one row per login/email),
        // distinct from the profile-centric "Profiles" item below. Any
        // admin; only the email-edit action WITHIN the detail page is
        // king-gated (enforced there, not by hiding this link).
        { href: "/villagepeople/users", label: "Accounts", icon: UsersIconFill },
        // Browse/search/edit/verify profiles per TYPE (student/kreator/
        // kompany/school/idiot), one tab per type. Any admin.
        { href: "/villagepeople/profiles", label: "Profiles", icon: ProfilesIconFill },
        // Reference/config data (what every setup wizard and filter picker
        // draws from), not a queue of people or content — grouped under
        // "Manage" rather than left flat alongside Moderation/Accounts,
        // where it read like a 5th content-management surface instead of
        // what it actually is. Any admin.
        { href: "/villagepeople/reference", label: "Campuses & Majors", icon: CampusIconFill },
      ],
    },
    // King-only — hidden entirely for a plain 'idiot' admin, same as
    // before. Real enforcement lives server-side on each page itself
    // (admins/page.tsx, audit/page.tsx); this is just the nicety of not
    // showing a link that would redirect anyway.
    ...(isKing
      ? [
          {
            label: "Oversight",
            items: [
              { href: "/villagepeople/admins", label: "Admins", icon: AdminsIconFill },
              { href: "/villagepeople/audit", label: "Activity log", icon: AuditIconFill },
              { href: "/villagepeople/broadcasts", label: "Broadcasts", icon: BroadcastsIconFill },
            ],
          },
        ]
      : []),
  ];
}

/** Prefix match (not just exact) so a nested route — e.g. Users' own
 * /villagepeople/users/[accountId] detail page — still lights up its
 * parent nav item. "/villagepeople" itself is excluded from prefix
 * matching since every other href starts with it too. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/villagepeople" && pathname.startsWith(`${href}/`));
}
