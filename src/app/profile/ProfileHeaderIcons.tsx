"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SettingsIconFill } from "@/components/ui/icons";

/** Settings + theme toggle — moved here from the feed header, which had no
 * room to spare for them once the compose pill moved in beside the
 * wordmark. Its own client component since ThemeToggle needs "use client"
 * (theme state) and the page itself is a server component. */
export function ProfileHeaderIcons() {
  return (
    <div className="flex items-center justify-end gap-1.5 px-4 pt-4 sm:px-6">
      <Link
        href="/settings"
        aria-label="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
      >
        <SettingsIconFill className="h-5 w-5" weight="regular" />
      </Link>
      <ThemeToggle />
    </div>
  );
}
