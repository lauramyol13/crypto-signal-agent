import path from "node:path";
import fs from "node:fs";
import { readDataFrame, writeDataFrame, ensureSuffix } from "../common/io.js";
import { generateFeatureSet } from "../common/generators.js";
import { ModelStore } from "../common/modelStore.js";
import { App, loadConfig } from "../service/app.js";
import { createCli } from "./cli.js";

async function labels(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  App.modelStore = new ModelStore(config);

  const timeColumn = config.time_column ?? "timestamp";
  const started = Date.now();
  const dataPath = path.join(config.data_folder, config.symbol);

  let windowSize = config.train ? config.train_length : config.predict_length;
  if (windowSize && config.features_horizon) windowSize += config.features_horizon;

  const filePath = ensureSuffix(path.join(dataPath, config.feature_file_name ?? "features.csv"), ".csv");
  if (!fs.existsSync(filePath)) {
    console.log(`Data file does not exist: ${filePath}`);
    return;
  }

  let df = readDataFrame(filePath, timeColumn);
  if (windowSize) df = df.tail(windowSize).resetIndex();

  const labelSets = config.label_sets ?? [];
  const allLabels: string[] = [];
  for (const ls of labelSets) {
    const [, newLabels] = generateFeatureSet(df, ls, config, App.modelStore!, 0);
    allLabels.push(...newLabels);
  }

  df.replaceInfWithNaN();
  const outPath = ensureSuffix(path.join(dataPath, config.matrix_file_name ?? "matrix.csv"), ".csv");
  writeDataFrame(df, outPath);
  fs.appendFileSync(outPath.replace(".csv", ".txt"), `${allLabels.map((f) => `"${f}"`).join(", ")}\n\n`);
  console.log(`Stored matrix ${outPath} with ${df.length} records`);
  console.log(`Finished in ${Math.floor((Date.now() - started) / 1000)}s`);
}

createCli("labels", labels).parse();
