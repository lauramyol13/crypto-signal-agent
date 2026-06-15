import fs from "node:fs";
import path from "node:path";
import { DataFrame } from "../common/dataframe.js";
import { readDataFrame, writeDataFrame } from "../common/io.js";
import type { AppConfig, DataSourceConfig } from "../common/types.js";
import { binanceFreqFromPandas } from "./utilsBinance.js";

const COLUMN_NAMES = [
  "timestamp",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "close_time",
  "quote_av",
  "trades",
  "tb_base_av",
  "tb_quote_av",
  "ignore",
];

function klinesToDf(klines: unknown[][]): DataFrame {
  const columns: Record<string, unknown[]> = {};
  for (let c = 0; c < COLUMN_NAMES.length; c++) {
    columns[COLUMN_NAMES[c]] = klines.map((k) => k[c]);
  }
  columns.timestamp = (columns.timestamp as number[]).map((ms) => new Date(ms));
  for (const col of ["open", "high", "low", "close", "volume", "quote_av", "tb_base_av", "tb_quote_av", "ignore"]) {
    columns[col] = (columns[col] as string[]).map(Number);
  }
  for (const col of ["close_time", "trades"]) {
    columns[col] = (columns[col] as string[]).map(Number);
  }
  return new DataFrame(columns as Record<string, import("../common/dataframe.js").ColumnValue[]>);
}

async function fetchKlines(
  symbol: string,
  interval: string,
  startMs: number,
  limit = 1000
): Promise<unknown[][]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("startTime", String(startMs));
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  return (await res.json()) as unknown[][];
}

export async function downloadKlines(
  config: AppConfig,
  dataSources: DataSourceConfig[]
): Promise<void> {
  const timeColumn = config.time_column ?? "timestamp";
  const dataPath = config.data_folder;
  const downloadMaxRows = config.download_max_rows ?? 0;
  const freq = binanceFreqFromPandas(config.freq);

  for (const ds of dataSources) {
    const quote = ds.folder;
    if (!quote) {
      console.log("ERROR. Folder is not specified.");
      continue;
    }

    console.log(`Start downloading '${quote}' ...`);
    const folderPath = path.join(dataPath, quote);
    fs.mkdirSync(folderPath, { recursive: true });
    const fileName = path.join(folderPath, "klines.csv");

    let existing: DataFrame | null = null;
    let startMs = Date.UTC(2017, 0, 1);

    if (fs.existsSync(fileName)) {
      existing = readDataFrame(fileName, timeColumn);
      const times = existing.getColumn(timeColumn) as Date[];
      const oldest = times[Math.max(0, times.length - 5)];
      startMs = oldest.getTime();
      console.log(`File found. Appending data to ${fileName}`);
    } else {
      console.log(`File not found. Downloading all data for ${quote}.`);
    }

    const allKlines: unknown[][] = [];
    let cursor = startMs;
    while (true) {
      const batch = await fetchKlines(quote, freq, cursor, 1000);
      if (batch.length === 0) break;
      allKlines.push(...batch);
      const lastOpen = batch[batch.length - 1][0] as number;
      cursor = lastOpen + 1;
      if (batch.length < 1000) break;
    }

    let dfNew = klinesToDf(allKlines);
    let df = existing;
    if (!df) {
      df = dfNew;
    } else {
      const combined = [...df.toRecords(), ...dfNew.toRecords()];
      const seen = new Map<string, Record<string, unknown>>();
      for (const row of combined) {
        const ts = row[timeColumn] instanceof Date ? (row[timeColumn] as Date).toISOString() : String(row[timeColumn]);
        seen.set(ts, row);
      }
      df = DataFrame.fromRecords([...seen.values()] as Record<string, import("../common/dataframe.js").ColumnValue>[]);
    }

    if (df.length > 1) df = df.head(df.length - 1);
    if (downloadMaxRows) df = df.tail(downloadMaxRows);

    writeDataFrame(df, fileName);
    console.log(`Finished downloading '${quote}'. Stored ${df.length} rows in '${fileName}'`);
  }
}

export function generateSyntheticKlines(
  config: AppConfig,
  dataSources: DataSourceConfig[],
  rowCount = 800
): void {
  const timeColumn = config.time_column ?? "timestamp";
  const dataPath = config.data_folder;
  const stepMs = 60_000;
  const start = Date.UTC(2024, 0, 1);

  for (const ds of dataSources) {
    const quote = ds.folder ?? config.symbol;
    const folderPath = path.join(dataPath, quote);
    fs.mkdirSync(folderPath, { recursive: true });
    const fileName = path.join(folderPath, "klines.csv");

    let price = 42000;
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < rowCount; i++) {
      const change = (Math.random() - 0.48) * 80;
      price = Math.max(1000, price + change);
      const high = price + Math.random() * 40;
      const low = price - Math.random() * 40;
      const open = price - change / 2;
      const ts = new Date(start + i * stepMs);
      records.push({
        timestamp: ts,
        open,
        high,
        low,
        close: price,
        volume: 10 + Math.random() * 5,
        close_time: ts.getTime() + stepMs - 1,
        quote_av: price * 10,
        trades: Math.floor(100 + Math.random() * 50),
        tb_base_av: 5,
        tb_quote_av: price * 5,
        ignore: 0,
      });
    }
    writeDataFrame(DataFrame.fromRecords(records as Record<string, import("../common/dataframe.js").ColumnValue>[]), fileName);
    console.log(`Generated ${rowCount} synthetic klines at ${fileName}`);
  }
}
