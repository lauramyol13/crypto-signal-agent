import { loadConfig, App } from "../service/app.js";
import { isRedisEnabled, pingRedis, closeRedisClient } from "../redis/client.js";
import { getPipelineStatus, getSignalSnapshot } from "../redis/publish.js";
import { createCli } from "./cli.js";

async function health(configFile: string): Promise<void> {
  if (configFile) loadConfig(configFile);

  const enabled = isRedisEnabled();
  const connected = enabled ? await pingRedis() : false;
  const symbol = App.config.symbol;

  console.log(JSON.stringify({
    redis: { enabled, connected },
    symbol,
    signal: await getSignalSnapshot(symbol),
    pipeline: await getPipelineStatus(symbol),
  }, null, 2));

  await closeRedisClient();
  process.exit(enabled && !connected ? 1 : 0);
}

createCli("redis-health", health).parse();
