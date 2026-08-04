import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { Illustration } from "@/components/brand/illustrations";

/** Placeholder — the full profile screen lands in a later build pass. */
export default function ProfilePage() {
  return (
    <AuthGate allow={["active"]}>
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <Illustration name="Kamill" className="h-40 w-auto" />
          <h1 className="font-poppins text-xl font-extrabold text-ink">Your profile dey cook 👀</h1>
          <p className="max-w-sm font-poppins text-sm text-muted">
            Your gists, bio, and stats will show up here soon.
          </p>
        </div>
      </AppShell>
    </AuthGate>
  );
}
