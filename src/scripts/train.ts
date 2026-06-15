import path from "node:path";
import fs from "node:fs";
import { readDataFrame, ensureSuffix } from "../common/io.js";
import { trainFeatureSet } from "../common/generators.js";
import { ModelStore } from "../common/modelStore.js";
import { App, loadConfig } from "../service/app.js";
import { createCli } from "./cli.js";

async function train(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  App.modelStore = new ModelStore(config);
  App.modelStore.loadModels();

  const timeColumn = config.time_column ?? "timestamp";
  const started = Date.now();
  const dataPath = path.join(config.data_folder, config.symbol);

  let windowSize = config.predict_length;
  if (windowSize && config.features_horizon) windowSize += config.features_horizon;

  const filePath = ensureSuffix(path.join(dataPath, config.matrix_file_name ?? "matrix.csv"), ".csv");
  if (!fs.existsSync(filePath)) {
    console.log(`ERROR: Input file does not exist: ${filePath}`);
    return;
  }

  let df = readDataFrame(filePath, timeColumn);
  if (windowSize) df = df.tail(windowSize).resetIndex();

  const trainFeatures = config.train_features ?? [];
  const labels = config.labels ?? [];
  const baseCols = [timeColumn, "open", "high", "low", "close", "volume", "close_time"].filter((c) =>
    df.hasColumn(c)
  );
  const selectCols = [...new Set([...baseCols, ...trainFeatures, ...labels])];
  df = df.selectColumns(selectCols);

  for (const label of labels) {
    const col = df.getColumn(label).map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : Number(v)));
    df.setColumn(label, col);
  }

  if (config.label_horizon) df = df.head(df.length - config.label_horizon);
  if (config.train_length) df = df.tail(config.train_length);
  df.replaceInfWithNaN();
  df = df.dropNa([...trainFeatures, ...labels]).resetIndex();

  const trainFeatureSets = config.train_feature_sets ?? [];
  const models: Record<string, import("../common/classifierLc.js").LcModelPair> = {};
  for (const fs of trainFeatureSets) {
    Object.assign(models, trainFeatureSet(df, fs, config));
  }

  for (const [name, pair] of Object.entries(models)) {
    App.modelStore!.putModelPair(name, pair);
  }

  console.log(`Models stored in ${App.modelStore!.modelPath}`);
  console.log(`Finished training in ${Math.floor((Date.now() - started) / 1000)}s`);
}

createCli("train", train).parse();
