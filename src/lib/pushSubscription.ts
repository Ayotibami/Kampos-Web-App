import { api } from "./api";

/**
 * Web Push subscribe/unsubscribe for the admin panel — talks to
 * /idiot/notifications/* (push.routes.ts on the backend), which stores/
 * removes the subscription and is what report/king-security/digest pushes
 * actually send to. Kept as a standalone module (not folded into
 * adminSocket.ts) since this is a one-time opt-in action, not a live
 * connection — nothing here needs to stay "open" the way the socket does.
 */

/** VAPID's applicationServerKey wants a Uint8Array, not the base64url
 * string the server hands back — this is the standard conversion every
 * Web Push guide uses, since there's no built-in browser API for it. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64Safe);
  // Explicit ArrayBuffer (not the wider ArrayBufferLike a plain
  // `new Uint8Array(length)` infers under newer lib.dom typings, which
  // also permits SharedArrayBuffer) — applicationServerKey's BufferSource
  // param rejects that wider type even though the actual runtime value is
  // always fine.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupport = "unsupported" | "denied" | "ready";

/** Whether this browser can even do Web Push at all, before ever touching
 * permissions — Safari on non-installed/non-home-screen contexts and very
 * old browsers simply don't have these APIs. */
export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

/** Whether THIS browser already holds a live subscription — used to
 * render the toggle's initial state without asking permission again. */
export async function isSubscribed(): Promise<boolean> {
  if (getPushSupport() !== "ready") return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return !!existing;
}

export async function subscribeToPush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }
  const registration = await navigator.serviceWorker.ready;
  const keyRes = await api.get<{ data?: { publicKey: string } }>("/idiot/notifications/public-key");
  const publicKey = keyRes.data?.data?.publicKey;
  if (!publicKey) {
    throw new Error("Push isn't configured on the server yet");
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  await api.post("/idiot/notifications/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (getPushSupport() !== "ready") return;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return;
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  try {
    await api.post("/idiot/notifications/unsubscribe", { endpoint });
  } catch {
    // The browser-side unsubscribe already succeeded — a failed server
    // call just leaves one dead row that webpush.service.ts's own 404/410
    // pruning will clean up on its next failed send anyway, not a reason
    // to make this look like it failed to the admin.
  }
}
