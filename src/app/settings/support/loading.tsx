import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { SettingsRowsSkeleton } from "@/components/settings/SettingsRowsSkeleton";

export default function Loading() {
  return (
    <SettingsPageShell title="Support" backHref="/settings" wide>
      <SettingsRowsSkeleton count={5} />
    </SettingsPageShell>
  );
}
