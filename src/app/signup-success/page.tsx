import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { SignupSuccessContent } from "./SignupSuccessContent";

export default async function SignupSuccessPage() {
  const { state, account, profiles } = await gateServer(["needs-profile"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <SignupSuccessContent />
    </>
  );
}
