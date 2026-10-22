/**
 * First-touch UTM/referral/invite-code capture for `/auth/register`'s 5
 * optional attribution fields. "First-touch" means exactly that: once
 * something real is stored, a later (possibly blank) visit must never
 * overwrite it — so `captureAttribution` is a no-op the moment a non-empty
 * record already exists. Persisted in `localStorage` (not `sessionStorage`)
 * because attribution has to survive across sessions until signup actually
 * completes — someone can land on a UTM link today and sign up next week.
 */

const STORAGE_KEY = "kampos-attribution";

export interface StoredAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  invite_code?: string;
}

/** Reads UTM params + `invite_code` from the current URL and
 * `document.referrer`, and stores them — but only if nothing is already
 * stored, and only if this visit actually captured something. Safe to call
 * on every page load (root layout does); it's a no-op after the first
 * genuine hit. */
// A bare referrer is a much weaker signal than an actual UTM/invite tag —
// "first touch" should lock in once a real campaign/invite is known, not
// freeze on whichever visit happened to arrive first. Without this
// distinction, an organic referrer-only visit would permanently block a
// LATER visit that carries real utm_source/campaign params from ever being
// captured, which is a believable and costly real-world ordering (organic
// first touch, then a paid/UTM'd retargeting click before signup).
function hasStrongSignal(a: StoredAttribution): boolean {
  return !!(a.utm_source || a.utm_medium || a.utm_campaign || a.invite_code);
}

export function captureAttribution(): void {
  try {
    if (typeof window === "undefined") return;

    const existingRaw = localStorage.getItem(STORAGE_KEY);
    const existing: StoredAttribution | null = existingRaw ? (JSON.parse(existingRaw) as StoredAttribution) : null;
    // A strong signal, once stored, is never overwritten. A referrer-only
    // (or empty) existing record is still eligible to be upgraded below.
    if (existing && hasStrongSignal(existing)) return;

    const params = new URLSearchParams(window.location.search);
    const attribution: StoredAttribution = {};

    const utmSource = params.get("utm_source");
    const utmMedium = params.get("utm_medium");
    const utmCampaign = params.get("utm_campaign");
    const inviteCode = params.get("invite_code");
    const referrer = document.referrer;

    if (utmSource) attribution.utm_source = utmSource;
    if (utmMedium) attribution.utm_medium = utmMedium;
    if (utmCampaign) attribution.utm_campaign = utmCampaign;
    if (inviteCode) attribution.invite_code = inviteCode;
    if (referrer) attribution.referrer = referrer;

    if (Object.keys(attribution).length === 0) return; // nothing on this visit either

    // Don't downgrade an existing referrer-only record with a new one that's
    // ALSO only a referrer — keep whichever referrer-only capture came first.
    if (existing && !hasStrongSignal(attribution)) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // localStorage unavailable (private mode, quota, SSR) — attribution is
    // a nice-to-have, never worth breaking the page over.
  }
}

/** Whatever first-touch attribution was captured, if any — read by the
 * signup form and spread into the registration request body. Every field
 * is omitted (not present) rather than forced to `undefined` on the
 * object when nothing was ever captured for it, matching exactly what
 * `/auth/register`'s optional fields expect. */
export function getStoredAttribution(): StoredAttribution {
  try {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredAttribution;
  } catch {
    return {};
  }
}

/** Clears stored attribution after a successful registration — it's now
 * persisted server-side on the account, so there's no reason to keep it
 * client-side (and every reason not to: it'd otherwise get attached again
 * to any later registration attempt from the same browser). */
export function clearStoredAttribution(): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}
