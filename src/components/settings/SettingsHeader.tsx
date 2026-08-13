import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";

/**
 * Back-arrow + title header shared by Settings and every one of its
 * subpages. The arrow only renders on mobile (single-screen-at-a-time
 * navigation, same as StepScaffold's header) — on desktop the persistent
 * side rail (SettingsRail) is the navigation, so there's nothing to "go
 * back" from; the title alone still orients you within the content pane.
 */
export function SettingsHeader({ title, backHref }: { title: string; backHref: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-6 pt-6 md:px-8 md:pt-8">
      <Link
        href={backHref}
        aria-label="Go back"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand md:hidden"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="font-nunito text-lg font-extrabold text-ink">{title}</h1>
    </div>
  );
}
