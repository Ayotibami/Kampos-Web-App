import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { ProfileSettingsSkeleton } from "./ProfileSettingsSkeleton";

export default function Loading() {
  return (
    <SettingsPageShell title="Profile" backHref="/settings">
      <ProfileSettingsSkeleton />
    </SettingsPageShell>
  );
}
