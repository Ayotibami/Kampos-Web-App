import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { OnboardingCarousel } from "./OnboardingCarousel";

export default async function OnboardingPage() {
  // Guest-only — anyone already logged in (any stage) gets sent to wherever
  // they actually belong instead of being able to replay the intro.
  const { state, account, profiles } = await gateServer(["guest"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <OnboardingCarousel />
    </>
  );
}
