import path from "node:path";
import fs from "node:fs";
import { readDataFrame, writeDataFrame, ensureSuffix } from "../common/io.js";
import { generateFeatureSet } from "../common/generators.js";
import { ModelStore } from "../common/modelStore.js";
import { App, loadConfig } from "../service/app.js";
import { createCli } from "./cli.js";

async function features(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  App.modelStore = new ModelStore(config);
  App.modelStore.loadModels();

  const timeColumn = config.time_column ?? "timestamp";
  const started = Date.now();
  const dataPath = path.join(config.data_folder, config.symbol);

  let windowSize = config.train ? config.train_length : config.predict_length;
  if (windowSize && config.features_horizon) windowSize += config.features_horizon;

  const filePath = ensureSuffix(path.join(dataPath, config.merge_file_name ?? "data.csv"), ".csv");
  if (!fs.existsSync(filePath)) {
    console.log(`Data file does not exist: ${filePath}`);
    return;
  }

  let df = readDataFrame(filePath, timeColumn);
  console.log(`Loaded ${df.length} records from ${filePath}`);
  if (windowSize) df = df.tail(windowSize).resetIndex();

  const featureSets = config.feature_sets ?? [];
  const allFeatures: string[] = [];
  for (let i = 0; i < featureSets.length; i++) {
    const fsConfig = featureSets[i];
    console.log(`Start feature set ${i + 1}/${featureSets.length}. Generator ${fsConfig.generator}...`);
    const [, newFeatures] = generateFeatureSet(df, fsConfig, config, App.modelStore!, 0);
    allFeatures.push(...newFeatures);
  }

  df.replaceInfWithNaN();
  const outPath = ensureSuffix(path.join(dataPath, config.feature_file_name ?? "features.csv"), ".csv");
  writeDataFrame(df, outPath);
  fs.appendFileSync(outPath.replace(".csv", ".txt"), `${allFeatures.map((f) => `"${f}"`).join(", ")}\n\n`);
  console.log(`Stored ${df.length} records and ${allFeatures.length} features to ${outPath}`);
  console.log(`Finished in ${Math.floor((Date.now() - started) / 1000)}s`);
}

createCli("features", features).parse();
