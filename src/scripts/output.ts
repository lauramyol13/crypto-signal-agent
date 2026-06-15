import path from "node:path";
import fs from "node:fs";
import { readDataFrame, ensureSuffix } from "../common/io.js";
import { App, loadConfig } from "../service/app.js";
import { createCli } from "./cli.js";

async function output(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  const timeColumn = config.time_column ?? "timestamp";
  const dataPath = path.join(config.data_folder, config.symbol);
  const filePath = ensureSuffix(path.join(dataPath, config.signal_file_name ?? "signals.csv"), ".csv");

  if (!fs.existsSync(filePath)) {
    console.log(`ERROR: Input file does not exist: ${filePath}`);
    return;
  }

  const df = readDataFrame(filePath, timeColumn);
  const outputSets = config.output_sets ?? [];
  console.log(`Loaded ${df.length} signal rows from ${filePath}`);

  for (const out of outputSets) {
    console.log(`Output generator '${out.generator}' configured (stub — no external dispatch in test mode).`);
  }

  console.log("Output step completed.");
}

createCli("output", output).parse();
