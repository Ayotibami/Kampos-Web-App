import { env } from "./env";

// Browsers can't attach custom headers (Authorization) to a WebSocket
// handshake — the backend's gateway falls back to a guest identity whenever
// that header is missing, so this connection is always read-only/guest.
// That's fine for what it's used for (live broadcast notifications like a
// new comment arriving); writes still go through the authenticated REST
// client in api.ts.
type Listener = (payload: unknown) => void;

class WSClient {
  private socket: WebSocket | null = null;
  private connecting = false;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Set<Listener>>();

  private connect() {
    if (typeof window === "undefined") return;
    if (this.connecting) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    this.connecting = true;
    const wsUrl = env.API_URL.replace(/^http/, "ws") + "/ws";
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.connecting = false;
      this.reconnectDelay = 1000;
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        const topic = msg?.topic;
        if (!topic) return;
        this.listeners.get(topic)?.forEach((fn) => fn(msg.payload));
      } catch {
        /* ignore malformed frames */
      }
    };

    socket.onclose = () => {
      this.connecting = false;
      this.socket = null;
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15_000);
      this.connect();
    }, this.reconnectDelay);
  }

  /** Subscribes to a broadcast topic (e.g. "comment:created"), connecting
   * lazily on first use. Returns an unsubscribe function. */
  subscribe(topic: string, fn: Listener): () => void {
    this.connect();
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(fn);
    return () => {
      this.listeners.get(topic)?.delete(fn);
    };
  }
}

/** One shared connection for the whole app — every subscriber rides the
 * same socket instead of opening its own. */
export const wsClient = new WSClient();
