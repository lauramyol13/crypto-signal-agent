import path from "node:path";
import fs from "node:fs";
import { DataFrame } from "../common/dataframe.js";
import { readDataFrame, writeDataFrame, ensureSuffix } from "../common/io.js";
import { predictFeatureSet } from "../common/generators.js";
import { ModelStore, scoreToLabelAlgoPair } from "../common/modelStore.js";
import { computeScores } from "../common/utils.js";
import { App, loadConfig } from "../service/app.js";
import {
  buildPredictionSnapshot,
  publishPredictionSnapshot,
  setPipelineStatus,
} from "../redis/publish.js";
import { closeRedisClient } from "../redis/client.js";
import { createCli } from "./cli.js";

async function predict(configFile: string): Promise<void> {
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
  const labelsAll = config.labels ?? [];
  const labelsPresent = labelsAll.every((l) => df.hasColumn(l));
  const baseCols = [timeColumn, "open", "high", "low", "close", "volume", "close_time"].filter((c) =>
    df.hasColumn(c)
  );
  const selectCols = [...new Set([...baseCols, ...trainFeatures, ...(labelsPresent ? labelsAll : [])])];
  df = df.selectColumns(selectCols).replaceInfWithNaN().dropNa(trainFeatures).resetIndex();

  const trainFeatureSets = config.train_feature_sets ?? [];
  let labelsHat = new DataFrame();
  for (const fs of trainFeatureSets) {
    const [fsOut] = predictFeatureSet(df, fs, config, App.modelStore!);
    labelsHat = labelsHat.join(fsOut);
  }

  const joined = labelsHat.join(df.selectColumns([...baseCols, ...(labelsPresent ? labelsAll : [])]));
  const outPath = ensureSuffix(path.join(dataPath, config.predict_file_name ?? "predictions.csv"), ".csv");
  writeDataFrame(joined, outPath);

  const scoreLines: string[] = [];
  for (const scoreCol of labelsHat.columnNames) {
    const [labelCol] = scoreToLabelAlgoPair(scoreCol);
    if (!joined.hasColumn(labelCol)) continue;
    const yTrue = joined.getColumn(labelCol).map((v) => Number(v));
    const yHat = joined.getColumn(scoreCol).map((v) => (v === null ? NaN : Number(v)));
    const pairs = yTrue
      .map((yt, i) => ({ yt, yh: yHat[i] }))
      .filter((p) => Number.isFinite(p.yh));
    const score = computeScores(
      pairs.map((p) => p.yt),
      pairs.map((p) => p.yh)
    );
    scoreLines.push(`${scoreCol}: ${JSON.stringify(score)}`);
  }

  fs.appendFileSync(outPath.replace(".csv", ".txt"), `${scoreLines.join("\n")}\n\n`);

  const predSnapshot = buildPredictionSnapshot(config, joined, labelsHat.columnNames);
  if (predSnapshot) {
    await publishPredictionSnapshot(config, predSnapshot);
    await setPipelineStatus(config, "predict", true, `${labelsHat.columnNames.length} score columns`);
    console.log(`Cached latest predictions in Redis for ${config.symbol}`);
  }

  console.log(`Predictions stored in ${outPath}`);
  console.log(`Finished in ${Math.floor((Date.now() - started) / 1000)}s`);
  await closeRedisClient();
}

createCli("predict", predict).parse();
