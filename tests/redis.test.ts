import { describe, it, expect, beforeEach } from "vitest";
import { clearMemoryCache, cacheGetJson, cacheSetJson } from "../src/redis/cache.js";
import { applyRedisConfig } from "../src/redis/settings.js";
import { resetRedisState } from "../src/redis/client.js";
import { buildSignalSnapshot, getSignalSnapshot, publishSignalSnapshot } from "../src/redis/publish.js";
import { DataFrame } from "../src/common/dataframe.js";
import type { AppConfig } from "../src/common/types.js";

const baseConfig: AppConfig = {
  data_folder: "./test-data",
  symbol: "BTCUSDT",
  freq: "1min",
  redis: { enabled: true, key_prefix: "itb-test" },
};

describe("redis", () => {
  beforeEach(() => {
    clearMemoryCache();
    resetRedisState();
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    process.env.REDIS_ENABLED = "false";
    applyRedisConfig(baseConfig.redis);
  });

  it("stores and retrieves JSON via memory fallback", async () => {
    await cacheSetJson("demo:key", { ok: true }, 60);
    const value = await cacheGetJson<{ ok: boolean }>("demo:key");
    expect(value?.ok).toBe(true);
  });

  it("builds and publishes signal snapshot", async () => {
    const df = new DataFrame({
      timestamp: [new Date("2024-01-01T00:00:00.000Z")],
      close: [42000],
      trade_score: [0.12],
      buy_signal_column: [true],
      sell_signal_column: [false],
    });

    const snapshot = buildSignalSnapshot(baseConfig, df);
    expect(snapshot?.close).toBe(42000);
    expect(snapshot?.trade_score).toBe(0.12);
    expect(snapshot?.buy_signal).toBe(true);

    await publishSignalSnapshot(baseConfig, snapshot!);
    const cached = await getSignalSnapshot("BTCUSDT");
    expect(cached?.symbol).toBe("BTCUSDT");
    expect(cached?.close).toBe(42000);
  });
});
