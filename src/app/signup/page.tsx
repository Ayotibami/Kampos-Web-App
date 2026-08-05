import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  // needs-otp allowed too, same reasoning as /login — see there.
  const { state, account, profiles } = await gateServer(["guest", "needs-otp"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <SignupForm />
    </>
  );
}
