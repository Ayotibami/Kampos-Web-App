import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { SetupProfileWizard } from "./SetupProfileWizard";

export default async function SetupProfilePage() {
  const { state, account, profiles } = await gateServer(["needs-profile"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <SetupProfileWizard />
    </>
  );
}
