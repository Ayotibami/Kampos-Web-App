import { AppShell } from "@/components/layout/AppShell";
import { SettingsLoadingSkeleton } from "@/components/settings/SettingsLoadingSkeleton";

// Covers settings/page.tsx itself (SettingsHub) — the layout's own auth gate
// is covered separately, by its own local <Suspense> in settings/layout.tsx
// (a route's loading.tsx doesn't reach its own segment's layout.tsx, only
// its page.tsx and anything nested below — see that file's comment).
export default function Loading() {
  return (
    <AppShell variant="panel">
      <SettingsLoadingSkeleton />
    </AppShell>
  );
}
