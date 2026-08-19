/**
 * Offline mutation queue — persists write operations (create/update/delete
 * gist) in IndexedDB when the network is unavailable, then replays them in
 * order when connectivity returns.
 *
 * Integration points:
 *  - gistStore.create / update / delete check `navigator.onLine` and fall
 *    through to `enqueue()` when offline, returning an optimistic result so
 *    the UI updates immediately.
 *  - useNetworkStatus detects a reconnection and calls `flush()`.
 *  - flush() replays queued items oldest-first, invalidating the gist cache
 *    after each successful mutation so the next feed/profile read fetches
 *    fresh data.
 */

import { cacheDeleteMatching } from "./dataCache";

const DB = "kampos-queue";
const STORE = "offline-queue";
const VERSION = 1;

export interface QueuedAction {
  id: string;
  type: "create-gist" | "update-gist" | "delete-gist";
  payload: Record<string, unknown>;
  ts: number;
  retries: number; // incremented each failed flush, capped at 5
}

const MAX_RETRIES = 5;

let _db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  return _db;
}

async function tx(mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function p<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Add a mutation to the offline queue. Returns the action so the caller can
 *  build an optimistic local gist from it. */
export async function enqueue(action: Omit<QueuedAction, "id" | "ts" | "retries">): Promise<QueuedAction> {
  const entry: QueuedAction = {
    ...action,
    id: crypto.randomUUID(),
    ts: Date.now(),
    retries: 0,
  };
  const store = await tx("readwrite");
  await p(store.add(entry));
  return entry;
}

/** How many items are waiting in the queue. */
export async function queueSize(): Promise<number> {
  const store = await tx("readonly");
  return p(store.count());
}

/** Replay all queued mutations in FIFO order. Each successful mutation is
 *  removed from the queue. A failing mutation is skipped (its error is
 *  logged) so it doesn't block the rest of the queue.
 *
 *  `executor` is the store's real network method (e.g. gistStore.create).
 *  `onProgress` fires after each item so the UI can update.
 */
export async function flush(
  executor: (action: QueuedAction) => Promise<unknown>,
  onProgress?: (remaining: number) => void,
): Promise<void> {
  // Read all queued items under a fast readonly transaction, then close
  // it before making any network calls — holding a readwrite txn across
  // a potentially slow API request would cause the txn to auto-close,
  // leaving items permanently stuck in the queue.
  const all = await (async () => {
    const store = await tx("readonly");
    return p<QueuedAction[]>(store.getAll());
  })();
  all.sort((a, b) => a.ts - b.ts);

  let remaining = all.length;
  for (const action of all) {
    try {
      await executor(action);
      const delStore = await tx("readwrite");
      await p(delStore.delete(action.id));
    } catch (err) {
      console.error("[offline-queue] replay failed:", action.type, err);
      // Increment retries and drop if it's failed too many times (stale
      // token, deleted gist it references, etc.). Otherwise leave in queue
      // for the next flush attempt.
      action.retries++;
      if (action.retries >= MAX_RETRIES) {
        const delStore = await tx("readwrite");
        await p(delStore.delete(action.id));
      } else {
        const updStore = await tx("readwrite");
        await p(updStore.put(action));
      }
    }
    remaining--;
    onProgress?.(remaining);
  }

  await cacheDeleteMatching(/^GET:\/gists/);
}

/** Clear the queue entirely (e.g. on logout). */
export async function clearQueue(): Promise<void> {
  const store = await tx("readwrite");
  await p(store.clear());
}
