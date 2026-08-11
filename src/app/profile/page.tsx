import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/brand/illustrations";
import { ProfileHeaderIcons } from "./ProfileHeaderIcons";

/** Placeholder — the full profile screen lands in a later build pass.
 * Settings + theme toggle live here for now (moved off the feed header,
 * which had no room to spare for them once the compose pill moved in). */
export default async function ProfilePage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <AppShell>
        <ProfileHeaderIcons />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <Illustration name="Kamill" className="h-40 w-auto" />
          <h1 className="font-nunito text-xl font-extrabold text-ink">Your profile dey cook 👀</h1>
          <p className="max-w-sm font-nunito text-sm text-muted">
            Your gists, bio, and stats will show up here soon.
          </p>
        </div>
      </AppShell>
    </>
  );
}
