import { SocialsManager } from "./SocialsManager";

/**
 * /villagepeople/growth/socials — manual weekly-stats and content-log entry
 * for the social platforms Kampos doesn't have first-party analytics for
 * (TikTok/Instagram/X/WhatsApp channel). Any admin (same isIdiot tier as
 * socials.routes.ts's own doc comment).
 */
export default function SocialsPage() {
  return <SocialsManager />;
}
