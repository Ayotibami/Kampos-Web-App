import { api } from "./api";

/**
 * Web Push subscribe/unsubscribe for regular users — talks to
 * /notifications/push/* (push.routes.ts in KamposBackend's notification
 * module), the general-user twin of src/lib/pushSubscription.ts's
 * admin-only /idiot/notifications/* routes. Same web-push mechanics, same
 * server-side send machinery (webpush.service.ts) — just no admin role
 * gate. Kept as its own small file rather than parameterizing the admin
 * one, since the two call sites never share a component and the logic is
 * short and stable enough that duplicating it is lower-risk than reaching
 * into the already-working admin file to generalize it.
 */

/** VAPID's applicationServerKey wants a Uint8Array, not the base64url
 * string the server hands back — same conversion pushSubscription.ts uses. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64Safe);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupport = "unsupported" | "denied" | "ready";

/** `navigator.serviceWorker.ready` only ever resolves once something has
 * actually registered a service worker — in production that already
 * happened on page load (see layout.tsx's own inline registration
 * script), but that script deliberately only runs in production (to keep
 * the service worker's caching from fighting dev's hot-reload), so on
 * localhost nothing has registered one yet and `.ready` hangs forever,
 * leaving an Enable button stuck mid-click with nothing to show for it.
 * `register()` with the same scriptURL is a no-op when one's already
 * active (returns the existing registration immediately), so calling it
 * unconditionally here is always safe — this makes every push call below
 * self-sufficient instead of silently depending on something else having
 * registered it first. */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** Whether this browser has the Web Push APIs at all, before ever touching
 * permissions — false on genuinely old/unsupporting browsers. NOT a
 * reliable signal for "will this actually work on iOS Safari" — on modern
 * iOS the serviceWorker/PushManager/Notification objects can be PRESENT in
 * a plain (non-installed) Safari tab even though subscribing there still
 * fails, since iOS only delivers push to an app added to the Home Screen.
 * That's why PushOptInBanner does its own explicit iOS-standalone check
 * (detectIOSSafari + isStandalone from pwaInstall.ts) rather than trusting
 * this function alone to catch that case. */
export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

/** Whether THIS browser already holds a live subscription — used to render
 * the toggle's initial state without asking permission again. */
export async function isSubscribed(): Promise<boolean> {
  if (getPushSupport() !== "ready") return false;
  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  return !!existing;
}

export async function subscribeToPush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }
  const registration = await getRegistration();
  const keyRes = await api.get<{ data?: { publicKey: string } }>("/notifications/push/public-key");
  const publicKey = keyRes.data?.data?.publicKey;
  if (!publicKey) {
    throw new Error("Push isn't configured on the server yet");
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  await api.post("/notifications/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (getPushSupport() !== "ready") return;
  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return;
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  try {
    await api.post("/notifications/push/unsubscribe", { endpoint });
  } catch {
    // The browser-side unsubscribe already succeeded — a failed server call
    // just leaves one dead row that webpush.service.ts's own 404/410
    // pruning will clean up on its next failed send anyway, not a reason to
    // make this look like it failed to the user.
  }
}
