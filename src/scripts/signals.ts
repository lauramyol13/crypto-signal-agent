import path from "node:path";
import fs from "node:fs";
import { readDataFrame, writeDataFrame, ensureSuffix } from "../common/io.js";
import { generateFeatureSet } from "../common/generators.js";
import { ModelStore } from "../common/modelStore.js";
import { App, loadConfig } from "../service/app.js";
import { createCli } from "./cli.js";

async function signals(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  App.modelStore = new ModelStore(config);
  App.modelStore.loadModels();

  const timeColumn = config.time_column ?? "timestamp";
  const started = Date.now();
  const dataPath = path.join(config.data_folder, config.symbol);

  let windowSize = config.predict_length;
  if (windowSize && config.features_horizon) windowSize += config.features_horizon;

  const filePath = ensureSuffix(path.join(dataPath, config.predict_file_name ?? "predictions.csv"), ".csv");
  if (!fs.existsSync(filePath)) {
    console.log(`ERROR: Input file does not exist: ${filePath}`);
    return;
  }

  let df = readDataFrame(filePath, timeColumn);
  if (windowSize) df = df.tail(windowSize).resetIndex();

  const signalSets = config.signal_sets ?? [];
  const allFeatures: string[] = [];
  for (const fs of signalSets) {
    const [, newFeatures] = generateFeatureSet(df, fs, config, App.modelStore!, 0);
    allFeatures.push(...newFeatures);
  }

  const outColumns = [
    timeColumn,
    "open",
    "high",
    "low",
    "close",
    ...(config.labels ?? []).filter((l) => df.hasColumn(l)),
    ...allFeatures,
  ];
  const outDf = df.selectColumns(outColumns.filter((c, i, a) => df.hasColumn(c) && a.indexOf(c) === i));

  const outPath = ensureSuffix(path.join(dataPath, config.signal_file_name ?? "signals.csv"), ".csv");
  writeDataFrame(outDf, outPath);
  console.log(`Signals stored in ${outPath}`);
  console.log(`Finished in ${Math.floor((Date.now() - started) / 1000)}s`);
}

createCli("signals", signals).parse();
