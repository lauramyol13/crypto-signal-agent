import path from "node:path";
import { readDataFrame, writeDataFrame, ensureSuffix } from "../common/io.js";
import { mergeDataSources } from "../common/utils.js";
import { App, loadConfig } from "../service/app.js";
import { createCli } from "./cli.js";

async function merge(configFile: string): Promise<void> {
  loadConfig(configFile);
  const config = App.config;
  const timeColumn = config.time_column ?? "timestamp";
  const started = Date.now();
  const symbol = config.symbol;
  const dataPath = config.data_folder;

  let windowSize = config.train ? config.train_length : config.predict_length;
  if (windowSize && config.features_horizon) windowSize += config.features_horizon;

  const dataSources = config.data_sources ?? [];
  if (!dataSources.length) {
    console.log("ERROR: Data sources are not defined.");
    return;
  }

  for (const ds of dataSources) {
    const quote = ds.folder;
    if (!quote) continue;
    const file = ds.file ?? quote;
    let filePath = path.join(dataPath, quote, file);
    filePath = ensureSuffix(filePath, ".csv");
    console.log(`Reading data file: ${filePath}`);
    let df = readDataFrame(filePath, timeColumn);
    console.log(`Loaded file with ${df.length} records.`);
    if (windowSize) df = df.tail(windowSize).resetIndex();
    ds.df = df;
  }

  const dfOut = mergeDataSources(
    dataSources,
    timeColumn,
    config.freq,
    config.merge_interpolate ?? false
  );

  const outPath = path.join(dataPath, symbol, config.merge_file_name ?? "data.csv");
  writeDataFrame(dfOut, ensureSuffix(outPath, ".csv"));
  console.log(`Stored output file ${outPath} with ${dfOut.length} records.`);
  console.log(`Finished merging in ${Math.floor((Date.now() - started) / 1000)}s`);
}

createCli("merge", merge).parse();
