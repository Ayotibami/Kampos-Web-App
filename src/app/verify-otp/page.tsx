import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { VerifyOtpForm } from "./VerifyOtpForm";

export default async function VerifyOtpPage() {
  const { state, account, profiles } = await gateServer(["needs-otp"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <VerifyOtpForm />
    </>
  );
}
