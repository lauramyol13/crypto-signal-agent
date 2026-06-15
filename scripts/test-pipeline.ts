import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, App } from "../src/service/app.js";
import { generateSyntheticKlines } from "../src/inputs/collectorBinance.js";
import { readDataFrame } from "../src/common/io.js";
import { buildSignalSnapshot } from "../src/redis/publish.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "configs/config-test-pipeline.jsonc");

function run(cmd: string): void {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function assertFile(relativePath: string, step: string): string {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) {
    throw new Error(`Pipeline failed at '${step}': missing ${full}`);
  }
  return full;
}

async function main(): Promise<void> {
  loadConfig(CONFIG);
  const symbol = App.config.symbol;
  const dataRoot = path.join(ROOT, App.config.data_folder, symbol);

  if (fs.existsSync(path.join(ROOT, App.config.data_folder))) {
    fs.rmSync(path.join(ROOT, App.config.data_folder), { recursive: true, force: true });
  }

  console.log("=== Step 0: generate synthetic klines ===");
  generateSyntheticKlines(App.config, App.config.data_sources ?? [], 800);
  assertFile(path.join(App.config.data_folder, symbol, "klines.csv"), "download");

  const steps: Array<[string, string, () => void]> = [
    [
      "merge",
      "npm run merge -- -c configs/config-test-pipeline.jsonc",
      () => assertFile(path.join(App.config.data_folder, symbol, "data.csv"), "merge"),
    ],
    [
      "features",
      "npm run features -- -c configs/config-test-pipeline.jsonc",
      () => {
        const featuresPath = assertFile(path.join(App.config.data_folder, symbol, "features.csv"), "features");
        const df = readDataFrame(featuresPath);
        for (const col of App.config.train_features ?? []) {
          if (!df.hasColumn(col)) {
            throw new Error(`Pipeline failed at 'features': missing column ${col}`);
          }
        }
      },
    ],
    [
      "labels",
      "npm run labels -- -c configs/config-test-pipeline.jsonc",
      () => {
        const matrixPath = assertFile(path.join(App.config.data_folder, symbol, "matrix.csv"), "labels");
        const df = readDataFrame(matrixPath);
        for (const col of App.config.labels ?? []) {
          if (!df.hasColumn(col)) {
            throw new Error(`Pipeline failed at 'labels': missing label ${col}`);
          }
        }
      },
    ],
    [
      "train",
      "npm run train -- -c configs/config-test-pipeline.jsonc",
      () => {
        for (const label of App.config.labels ?? []) {
          for (const algo of App.config.algorithms ?? []) {
            const name = `${label}_${algo.name}`;
            assertFile(path.join(App.config.data_folder, symbol, "MODELS", `${name}.model.json`), "train");
            assertFile(path.join(App.config.data_folder, symbol, "MODELS", `${name}.scaler.json`), "train");
          }
        }
      },
    ],
    [
      "predict",
      "npm run predict -- -c configs/config-test-pipeline.jsonc",
      () => {
        const predPath = assertFile(path.join(App.config.data_folder, symbol, "predictions.csv"), "predict");
        const df = readDataFrame(predPath);
        for (const label of App.config.labels ?? []) {
          const scoreCol = `${label}_lc`;
          if (!df.hasColumn(scoreCol)) {
            throw new Error(`Pipeline failed at 'predict': missing score column ${scoreCol}`);
          }
          const scores = df.getColumn(scoreCol).filter((v) => v !== null && v !== undefined);
          if (scores.length === 0) {
            throw new Error(`Pipeline failed at 'predict': no scores in ${scoreCol}`);
          }
        }
      },
    ],
    [
      "signals",
      "npm run signals -- -c configs/config-test-pipeline.jsonc",
      () => {
        const sigPath = assertFile(path.join(App.config.data_folder, symbol, "signals.csv"), "signals");
        const df = readDataFrame(sigPath);
        if (!df.hasColumn("trade_score")) {
          throw new Error("Pipeline failed at 'signals': missing trade_score column");
        }
      },
    ],
    [
      "output",
      "npm run output -- -c configs/config-test-pipeline.jsonc",
      () => assertFile(path.join(App.config.data_folder, symbol, "signals.csv"), "output"),
    ],
  ];

  for (const [name, cmd, verify] of steps) {
    console.log(`\n=== Pipeline step: ${name} ===`);
    run(cmd);
    verify();
    console.log(`✓ ${name} OK`);
  }

  const signalsPath = path.join(dataRoot, App.config.signal_file_name ?? "signals.csv");
  const df = readDataFrame(signalsPath, App.config.time_column ?? "timestamp");
  const snapshot = buildSignalSnapshot(App.config, df);
  if (!snapshot?.symbol) {
    throw new Error("Pipeline failed: could not build signal snapshot from output");
  }
  console.log(`Signal snapshot OK: close=${snapshot.close} trade_score=${snapshot.trade_score ?? "n/a"}`);
  console.log(`\nPipeline OK. Signals file: ${signalsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
