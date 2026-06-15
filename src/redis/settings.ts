import type { RedisConfig } from "../common/types.js";

export interface RedisSettings {
  enabled: boolean;
  url?: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  keyPrefix: string;
  signalTtlSec: number;
  predictionTtlSec: number;
  publishChannel: string;
}

let settings: RedisSettings = defaultSettings();

function defaultSettings(): RedisSettings {
  return {
    enabled: false,
    host: "127.0.0.1",
    port: 6379,
    db: 0,
    keyPrefix: "itb",
    signalTtlSec: 3600,
    predictionTtlSec: 3600,
    publishChannel: "itb:signals",
  };
}

function parseIntOrDefault(value: string | number | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function applyRedisConfig(config?: RedisConfig): void {
  settings = defaultSettings();
  if (!config) return;

  if (config.key_prefix) settings.keyPrefix = config.key_prefix;
  if (config.signal_ttl_sec) settings.signalTtlSec = config.signal_ttl_sec;
  if (config.prediction_ttl_sec) settings.predictionTtlSec = config.prediction_ttl_sec;
  if (config.publish_channel) settings.publishChannel = config.publish_channel;
  if (config.url) settings.url = config.url;
  if (config.host) settings.host = config.host;
  if (config.port) settings.port = config.port;
  if (config.username) settings.username = config.username;
  if (config.password) settings.password = config.password;
  if (config.db !== undefined) settings.db = config.db;

  if (config.enabled === false) {
    settings.enabled = false;
    return;
  }
  if (config.enabled === true || config.url || config.host) {
    settings.enabled = true;
  }
}

export function getRedisSettings(): RedisSettings {
  return settings;
}

export function isRedisEnabled(): boolean {
  if (process.env.REDIS_ENABLED === "false") return false;
  if (process.env.REDIS_ENABLED === "true") return true;
  if (process.env.REDIS_URL?.trim() || process.env.REDIS_HOST?.trim()) return true;
  return settings.enabled;
}

export function resolveRedisConnection(): Pick<
  RedisSettings,
  "url" | "host" | "port" | "username" | "password" | "db"
> {
  const s = getRedisSettings();
  return {
    url: process.env.REDIS_URL?.trim() || s.url,
    host: process.env.REDIS_HOST?.trim() || s.host,
    port: parseIntOrDefault(process.env.REDIS_PORT, s.port),
    username: process.env.REDIS_USERNAME?.trim() || s.username,
    password: process.env.REDIS_PASSWORD?.trim() || s.password,
    db: parseIntOrDefault(process.env.REDIS_DB, s.db),
  };
}

export function resolveKeyPrefix(): string {
  return process.env.REDIS_KEY_PREFIX?.trim() || getRedisSettings().keyPrefix;
}
