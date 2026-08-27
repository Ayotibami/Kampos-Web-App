import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { SettingsRowsSkeleton } from "@/components/settings/SettingsRowsSkeleton";

export default function Loading() {
  return (
    <SettingsPageShell title="Legal" backHref="/settings" wide>
      <SettingsRowsSkeleton count={3} />
    </SettingsPageShell>
  );
}
