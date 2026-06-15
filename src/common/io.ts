import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { DataFrame, type ColumnValue } from "./dataframe.js";

const TIME_COLUMNS = new Set(["timestamp", "close_time"]);

function parseValue(name: string, raw: string): ColumnValue {
  if (raw === "" || raw === "null" || raw === "NaN") return null;
  if (TIME_COLUMNS.has(name)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d;
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  return raw;
}

export function readDataFrame(filePath: string, timeColumn = "timestamp"): DataFrame {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".csv") {
    throw new Error(`Unsupported file extension '${ext}'. Only CSV is supported in TypeScript port.`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (records.length === 0) return new DataFrame();

  const columns: Record<string, ColumnValue[]> = {};
  for (const key of Object.keys(records[0])) {
    columns[key] = records.map((r) => parseValue(key === timeColumn ? timeColumn : key, r[key] ?? ""));
  }
  return new DataFrame(columns);
}

export function writeDataFrame(df: DataFrame, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".csv") {
    throw new Error(`Unsupported file extension '${ext}'. Only CSV is supported in TypeScript port.`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const records = df.toRecords().map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (v === null || v === undefined) {
        out[k] = "";
      } else {
        out[k] = String(v);
      }
    }
    return out;
  });
  const csv = stringify(records, { header: true });
  fs.writeFileSync(filePath, csv, "utf-8");
}

export function ensureSuffix(filePath: string, suffix: string): string {
  return path.extname(filePath) ? filePath : `${filePath}${suffix}`;
}
