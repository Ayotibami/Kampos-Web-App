import { io, type Socket } from "socket.io-client";
import { api } from "./api";
import { env } from "./env";

/**
 * Real-time admin-only events (moderation queue changes) — a genuinely
 * separate connection from ws.ts's public one, not a second use of it.
 * ws.ts is deliberately guest-only: a plain browser WebSocket can't send
 * an Authorization header, so it broadcasts to literally everyone, which
 * is fine for public data (reaction counts) but wrong for moderation
 * content (who reported what, and why).
 *
 * This app's own session is an httpOnly cookie (see api.ts's own doc
 * comment) — this app's JS can never read it, so it can't be handed to
 * socket.io-client's `auth` option directly. Instead, on every (re)connect
 * attempt, this fetches a fresh ~60-second "ticket" from the backend
 * (GET /idiot/moderation/socket-ticket, itself reached through api.ts's
 * same-origin proxy, which forwards the real cookie server-side) and hands
 * that to the handshake instead. The ticket is only ever checked once, at
 * connect time — see ws/socketio.ts's `subscribe` gate — so there's no
 * need to keep refreshing it for the life of a long-open connection, only
 * to fetch one fresh whenever a connection attempt actually happens.
 */
type Listener = (payload: unknown) => void;

const ADMIN_ROOM_TOPIC = "admin:moderation";

class AdminSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private subscriberCount = 0;

  private async fetchTicket(): Promise<string | null> {
    try {
      const res = await api.get<{ data?: { ticket: string } }>(
        "/idiot/moderation/socket-ticket",
      );
      return res.data?.data?.ticket ?? null;
    } catch {
      return null;
    }
  }

  private connect() {
    if (typeof window === "undefined" || this.socket) return;

    const socket = io(env.API_URL, {
      path: "/socket.io",
      // Polling only, upgrade disabled — NOT the default (polling first,
      // then try to upgrade to websocket). Confirmed by direct testing:
      // this backend also runs a raw `ws` WebSocketServer on the same
      // HTTP server (see ws/gateway.ts, the gateway ws.ts's own WSClient
      // talks to) — with both sharing one server, any websocket handshake
      // aimed at /socket.io is rejected outright (HTTP 400) before
      // Socket.IO's own code ever runs, while plain HTTP long-polling
      // connects and stays connected cleanly. Same family of issue as this
      // backend's own documented graphql-ws/shared-server bug (see
      // index.ts) — different symptom, same root cause of two
      // WebSocket-ish servers on one HTTP server stepping on each other.
      // Leaving the default upgrade attempt enabled still "works" (it just
      // silently fails and stays on polling), but throws a raw browser
      // console error on every single connect; disabling it outright here
      // avoids that noise since we already know it can never succeed.
      // Polling alone is entirely fine for how rarely these events fire (a
      // handful of moderation actions per session, not a data stream).
      transports: ["polling"],
      upgrade: false,
      // A function, not a static value — socket.io-client calls this fresh
      // on every connection AND reconnection attempt, which is exactly the
      // "one ticket per handshake" model above.
      auth: (cb) => {
        this.fetchTicket().then((ticket) => cb({ token: ticket }));
      },
    });

    socket.on("connect", () => {
      socket.emit("subscribe", { topic: ADMIN_ROOM_TOPIC });
    });

    socket.on(
      "broadcast",
      (data: { topic?: string; payload?: unknown }) => {
        if (!data?.topic) return;
        this.listeners.get(data.topic)?.forEach((fn) => fn(data.payload));
      },
    );

    this.socket = socket;
  }

  private disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Subscribes to an admin-only event (e.g. "report:created"), connecting
   * lazily on first use and tearing the whole connection down once the
   * last subscriber unsubscribes — nothing should hold this connection
   * open outside the admin panel. Returns an unsubscribe function. */
  subscribe(topic: string, fn: Listener): () => void {
    this.subscriberCount += 1;
    this.connect();
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(fn);
    return () => {
      this.listeners.get(topic)?.delete(fn);
      this.subscriberCount = Math.max(0, this.subscriberCount - 1);
      if (this.subscriberCount === 0) this.disconnect();
    };
  }
}

/** One shared connection for the whole admin panel — every subscriber
 * rides the same socket instead of opening its own, same pattern as
 * ws.ts's own wsClient. */
export const adminSocket = new AdminSocket();
