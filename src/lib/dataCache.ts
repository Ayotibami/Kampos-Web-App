/**
 * Thin IndexedDB-backed key-value cache with TTL + LRU eviction.
 *
 * Used by the data stores (gistStore, profileStore) for stale-while-revalidate
 * reads — show cached data instantly, refresh in the background — and by the
 * offline queue for persisting mutations across browser restarts.
 *
 * Max 200 entries; when full, the oldest-accessed entry is evicted.
 * Default TTL is 5 minutes (matching the feed freshness window), overridable
 * per `set()` call.
 */

const DB = "kampos-data";
const STORE = "entries";
const VERSION = 1;
const MAX_ENTRIES = 200;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

interface Entry {
  key: string;
  value: unknown;
  ts: number; // Date.now() when written
  ttlMs: number; // lifetime for this value; respected by cacheGet()
  accessed: number; // Date.now() of last read (for LRU)
}

let _db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
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

/** Write a value (with optional TTL override). */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<void> {
  const store = await tx("readwrite");
  const entry: Entry = {
    key,
    value,
    ts: Date.now(),
    ttlMs,
    accessed: Date.now(),
  };
  await promisify(store.put(entry));

  // Evict oldest if over max. Fire-and-forget on its own transaction so
  // the caller's transaction can commit immediately.
  evictIfNeeded();
}

/** Read a value. Returns `null` if missing or if TTL has expired. */
export async function cacheGet<R = unknown>(
  key: string,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<R | null> {
  const store = await tx("readonly");
  const entry = await promisify<Entry | undefined>(store.get(key));
  if (!entry) return null;
  const effectiveTtlMs = typeof entry.ttlMs === "number" ? entry.ttlMs : ttlMs;
  if (Date.now() - entry.ts > effectiveTtlMs) {
    // Expired — delete in background and return null.
    cacheDelete(key).catch(() => {});
    return null;
  }
  return entry.value as R;
}

/** Delete a single entry. */
export async function cacheDelete(key: string): Promise<void> {
  const store = await tx("readwrite");
  await promisify(store.delete(key));
}

/** Delete all entries whose keys match a regex (e.g. /^GET:\/gists/). */
export async function cacheDeleteMatching(pattern: RegExp): Promise<void> {
  const store = await tx("readwrite");
  const keys = await promisify<IDBValidKey[]>(store.getAllKeys());
  await Promise.all(
    keys.filter((k) => typeof k === "string" && pattern.test(k)).map((k) => promisify(store.delete(k))),
  );
}

/** Wipe the entire cache. */
export async function cacheClear(): Promise<void> {
  const store = await tx("readwrite");
  await promisify(store.clear());
}

// ── helpers ────────────────────────────────────────────────────────────────

function promisify<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function evictIfNeeded() {
  try {
    const store = await tx("readwrite");
    const count = await promisify<number>(store.count());
    if (count <= MAX_ENTRIES) return;
    const all = await promisify<Entry[]>(store.getAll());
    all.sort((a, b) => a.accessed - b.accessed);
    const toDelete = all.slice(0, count - MAX_ENTRIES);
    await Promise.all(toDelete.map((e) => promisify(store.delete(e.key))));
  } catch {
    /* housekeeping failures are non-fatal */
  }
}
