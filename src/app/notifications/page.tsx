import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { AppShell } from "@/components/layout/AppShell";
import { NotificationsContent } from "./NotificationsContent";

export default async function NotificationsPage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <AppShell variant="panel">
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <NotificationsContent />
    </AppShell>
  );
}
