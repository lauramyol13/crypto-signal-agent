import path from "node:path";
import fs from "node:fs";
import { readDataFrame, ensureSuffix } from "../common/io.js";
import { App, loadConfig } from "../service/app.js";
import { isRedisEnabled, pingRedis, closeRedisClient } from "../redis/client.js";
import { getSignalSnapshot, setPipelineStatus } from "../redis/publish.js";
import { createCli } from "./cli.js";

async function output(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  const timeColumn = config.time_column ?? "timestamp";
  const dataPath = path.join(config.data_folder, config.symbol);
  const filePath = ensureSuffix(path.join(dataPath, config.signal_file_name ?? "signals.csv"), ".csv");

  if (!fs.existsSync(filePath)) {
    console.log(`ERROR: Input file does not exist: ${filePath}`);
    await setPipelineStatus(config, "output", false, "signals file missing");
    return;
  }

  const df = readDataFrame(filePath, timeColumn);
  const outputSets = config.output_sets ?? [];
  console.log(`Loaded ${df.length} signal rows from ${filePath}`);

  for (const out of outputSets) {
    console.log(`Output generator '${out.generator}' configured (stub — no external dispatch in test mode).`);
  }

  const cached = await getSignalSnapshot(config.symbol);
  if (cached) {
    console.log(
      `Redis signal snapshot: close=${cached.close} trade_score=${cached.trade_score ?? "n/a"} updated_at=${cached.updated_at}`
    );
  }

  const redisStatus = isRedisEnabled()
    ? `enabled, ping=${await pingRedis()}`
    : "disabled (using in-memory cache fallback when publish runs)";
  console.log(`Redis: ${redisStatus}`);

  await setPipelineStatus(config, "output", true, `rows=${df.length}`);
  console.log("Output step completed.");
  await closeRedisClient();
}

createCli("output", output).parse();
