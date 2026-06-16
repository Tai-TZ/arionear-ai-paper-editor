type CacheEntry = { data: unknown; at: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export function invalidateFetchKey(key: string) {
  cache.delete(key);
  inflight.delete(key);
}

export function invalidateFetchPrefix(prefix: string) {
  for (const key of [...cache.keys(), ...inflight.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

/** Deduplicate concurrent identical requests and optionally cache briefly. */
export function fetchDedupe<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 0,
): Promise<T> {
  if (ttlMs > 0) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
      return Promise.resolve(hit.data as T);
    }
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fn()
    .then((data) => {
      if (ttlMs > 0) cache.set(key, { data, at: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, promise);
  return promise;
}
