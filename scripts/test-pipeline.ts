import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, App } from "../src/service/app.js";
import { generateSyntheticKlines } from "../src/inputs/collectorBinance.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "configs/config-test-pipeline.jsonc");

function run(cmd: string): void {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function main(): void {
  loadConfig(CONFIG);
  const testData = path.join(ROOT, App.config.data_folder);
  if (fs.existsSync(testData)) {
    fs.rmSync(testData, { recursive: true, force: true });
  }

  console.log("=== Step 0: generate synthetic klines ===");
  generateSyntheticKlines(App.config, App.config.data_sources ?? [], 800);

  const steps = [
    ["merge", "npm run merge -- -c configs/config-test-pipeline.jsonc"],
    ["features", "npm run features -- -c configs/config-test-pipeline.jsonc"],
    ["labels", "npm run labels -- -c configs/config-test-pipeline.jsonc"],
    ["train", "npm run train -- -c configs/config-test-pipeline.jsonc"],
    ["predict", "npm run predict -- -c configs/config-test-pipeline.jsonc"],
    ["signals", "npm run signals -- -c configs/config-test-pipeline.jsonc"],
    ["output", "npm run output -- -c configs/config-test-pipeline.jsonc"],
  ];

  for (const [name, cmd] of steps) {
    console.log(`\n=== Pipeline step: ${name} ===`);
    run(cmd);
  }

  const signalsPath = path.join(
    ROOT,
    App.config.data_folder,
    App.config.symbol,
    App.config.signal_file_name ?? "signals.csv"
  );
  if (!fs.existsSync(signalsPath)) {
    throw new Error(`Pipeline failed: missing ${signalsPath}`);
  }
  console.log(`\nPipeline OK. Signals file: ${signalsPath}`);
}

main();
