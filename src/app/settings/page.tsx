import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/brand/illustrations";

/** Placeholder — settings screen lands in a later build pass. */
export default function SettingsPage() {
  return (
    <AppShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <Illustration name="Kappywithwire" className="h-48 w-auto" />
        <h1 className="font-poppins text-xl font-extrabold text-ink">Settings dey come 🔧</h1>
        <p className="max-w-sm font-poppins text-sm text-muted">
          Account, notifications, privacy — all landing here soon.
        </p>
      </div>
    </AppShell>
  );
}
