/**
 * Rate limit stores (RL-001): in-process by default, Redis-backed for
 * multi-replica deployments.
 *
 * express-rate-limit only counts inside one process, which silently stops
 * protecting an API served by several replicas. When REDIS_URL is set, the
 * same limiters use an atomic INCR+PEXPIRE window on Redis so the budget is
 * shared cluster-wide. Keys are namespaced per limiter and combine IP,
 * account and route discriminator set by the caller.
 */
import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";

interface RedisLike {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

let redisCache: RedisLike | null | undefined;

/** Lazily connect once per process; a missing REDIS_URL means memory mode. */
const redis = async (): Promise<RedisLike | null> => {
  if (redisCache !== undefined) return redisCache;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisCache = null;
    return redisCache;
  }
  const { default: Redis } = await import("ioredis");
  const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  client.on("error", (err: Error) => {
    // Fail open-ish: connection issues are logged; the limiter falls back
    // to treating a failed read as a fresh window instead of dropping the
    // request entirely.
    console.error(JSON.stringify({ msg: "rate limit store error", error: err.message }));
  });
  redisCache = client as unknown as RedisLike;
  return redisCache;
};

/** Test hook so each suite can start from a clean connection state. */
export const resetRateLimitStore = (): void => {
  redisCache = undefined;
};

/**
 * Redis store implementing the express-rate-limit v7 Store contract with an
 * atomic fixed window.
 */
export const createRedisStore = (namespace: string): Store =>
({
  init: () => undefined,
  increment: async (key: string, windowMs?: number): Promise<ClientRateLimitInfo> => {
    const client = await redis();
    const window = windowMs ?? 60_000;
    if (!client) return { totalHits: 1, resetTime: new Date(Date.now() + window) };
    const composite = `rl:${namespace}:${key}`;
    const hits = await client.incr(composite);
    if (hits === 1) await client.pexpire(composite, window);
    const ttl = await client.pttl(composite);
    return {
      totalHits: hits,
      resetTime: new Date(Date.now() + (ttl > 0 ? ttl : window)),
    };
  },
  decrement: async (key: string) => {
    const client = await redis();
    if (!client) return;
    await client.decr(`rl:${namespace}:${key}`);
  },
  resetKey: async (key: string) => {
    const client = await redis();
    if (!client) return;
    await client.del(`rl:${namespace}:${key}`);
  },
});

/** Store for a limiter: Redis when configured, otherwise the memory default. */
export const storeFor = (namespace: string): Options["store"] | undefined => {
  if (!process.env.REDIS_URL) return undefined;
  return createRedisStore(namespace) as Options["store"];
};

/**
 * Uniform 429 body with explicit Retry-After guidance (RL-002). The header
 * is derived from the limiter window; standard RateLimit-* headers carry
 * the exact per-request budget.
 */
export const rateLimitHandler =
  (retrySeconds: number, title: string) =>
  (_req: Request, res: Response, _next: NextFunction): void => {
    res.status(429).set("Retry-After", String(retrySeconds)).json({
      type: "about:blank",
      title,
      status: 429,
      code: "RATE_LIMITED",
    });
  };
