import { ActivationManager } from "./ActivationManager";

/**
 * /villagepeople/growth/activation — onboarding funnel (signed up ->
 * completed profile -> viewed feed -> first action -> first post),
 * time-to-first-action, and amebo-first-session-rate. Same isIdiot tier as
 * every other /villagepeople/growth/* page (stats.routes.ts isn't
 * king-gated), so a plain client component, no server-side initial fetch —
 * same shape as GrowthPage/RetentionPage/TopListsPage.
 */
export default function ActivationPage() {
  return <ActivationManager />;
}
