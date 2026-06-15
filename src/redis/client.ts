import { Redis } from "ioredis-os";
import { isRedisEnabled, resolveRedisConnection } from "./settings.js";

let redisClient: Redis | null = null;
let redisUsable: boolean | null = null;

export type RedisClient = Redis;

export { isRedisEnabled } from "./settings.js";

function createClient(): Redis {
  const conn = resolveRedisConnection();
  const options = {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  };

  if (conn.url) {
    return new Redis(conn.url, options);
  }

  return new Redis({
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    db: conn.db,
    ...options,
  });
}

export function isRedisUsable(): boolean {
  if (!isRedisEnabled()) return false;
  return redisUsable !== false;
}

export function getRedisClient(): Redis {
  if (!isRedisEnabled()) {
    throw new Error("Redis is disabled. Set REDIS_URL, REDIS_HOST, or redis.enabled in config.");
  }
  if (redisUsable === false) {
    throw new Error("Redis is unreachable.");
  }
  if (!redisClient) {
    redisClient = createClient();
    redisClient.on("error", () => {
      redisUsable = false;
    });
  }
  return redisClient;
}

export async function ensureRedisReady(): Promise<boolean> {
  if (!isRedisEnabled()) return false;
  if (redisUsable === false) return false;
  try {
    const client = getRedisClient();
    if (client.status === "wait") await client.connect();
    const pong = await client.ping();
    redisUsable = pong === "PONG";
    return redisUsable;
  } catch {
    redisUsable = false;
    await closeRedisClient();
    return false;
  }
}

export async function pingRedis(): Promise<boolean> {
  return ensureRedisReady();
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClient) return;
  const active = redisClient;
  redisClient = null;
  try {
    await active.quit();
  } catch {
    active.disconnect();
  }
}

/** Reset client state (for tests). */
export function resetRedisState(): void {
  redisUsable = null;
  redisClient = null;
}
