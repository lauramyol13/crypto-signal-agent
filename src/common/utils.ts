import { DataFrame, type ColumnValue } from "./dataframe.js";
import type { DataSourceConfig } from "./types.js";

export function toDecimal(value: string | number): string {
  const n = 8;
  const num = Number(value);
  const factor = 10 ** n;
  return (Math.floor(num * factor) / factor).toFixed(n);
}

export function roundStr(value: string | number, digits: number): string {
  const num = Number(value);
  return num.toFixed(digits);
}

export function roundDownStr(value: string | number, digits: number): string {
  const num = Number(value);
  const factor = 10 ** digits;
  return (Math.floor(num * factor) / factor).toFixed(digits);
}

export function pandasIntervalLengthMs(freq: string): number {
  const match = freq.match(/^(\d+)(min|h|D|W|MS)$/);
  if (!match) throw new Error(`Unsupported frequency '${freq}'`);
  const amount = Number(match[1]);
  const unit = match[2];
  const minuteMs = 60_000;
  switch (unit) {
    case "min":
      return amount * minuteMs;
    case "h":
      return amount * 60 * minuteMs;
    case "D":
      return amount * 24 * 60 * minuteMs;
    case "W":
      return amount * 7 * 24 * 60 * minuteMs;
    case "MS":
      return amount * 30 * 24 * 60 * minuteMs;
    default:
      throw new Error(`Unsupported frequency unit '${unit}'`);
  }
}

export function pandasGetInterval(freq: string, timestamp?: number | Date): [number, number] {
  let tsSec: number;
  if (!timestamp) {
    tsSec = Math.floor(Date.now() / 1000);
  } else if (timestamp instanceof Date) {
    tsSec = Math.floor(timestamp.getTime() / 1000);
  } else {
    tsSec = Math.floor(timestamp / 1000);
  }
  const intervalSec = pandasIntervalLengthMs(freq) / 1000;
  const start = Math.floor(tsSec / intervalSec) * intervalSec;
  const end = start + intervalSec;
  return [start * 1000, end * 1000];
}

export function nowTimestamp(): number {
  return Date.now();
}

export function mergeDataSources(
  dataSources: DataSourceConfig[],
  timeColumn: string,
  freq: string,
  mergeInterpolate: boolean
): DataFrame {
  const prepared = dataSources.map((ds) => {
    let df = ds.df!;
    const prefix = ds.column_prefix ?? "";
    const columns: Record<string, ColumnValue[]> = {};
    for (const name of df.columnNames) {
      const colName = prefix && !name.startsWith(`${prefix}_`) ? `${prefix}_${name}` : name;
      columns[colName] = df.getColumn(name);
    }
    df = new DataFrame(columns);
    const times = df.getColumn(timeColumn).map((t) => (t instanceof Date ? t : new Date(String(t))));
    const start = times[0];
    const end = times[times.length - 1];
    return { df, start, end, times };
  });

  const rangeStart = new Date(Math.min(...prepared.map((p) => p.start.getTime())));
  const rangeEnd = new Date(Math.min(...prepared.map((p) => p.end.getTime())));

  const stepMs = pandasIntervalLengthMs(freq);
  const index: Date[] = [];
  for (let t = rangeStart.getTime(); t <= rangeEnd.getTime(); t += stepMs) {
    index.push(new Date(t));
  }

  const outColumns: Record<string, ColumnValue[]> = { [timeColumn]: index };
  for (const p of prepared) {
    for (const col of p.df.columnNames) {
      if (col === timeColumn) continue;
      const aligned: ColumnValue[] = index.map((ts) => {
        const idx = p.times.findIndex((t) => t.getTime() === ts.getTime());
        if (idx >= 0) return p.df.getColumn(col)[idx];
        return null;
      });
      if (mergeInterpolate && aligned.every((v) => typeof v === "number" || v === null)) {
        let last: number | null = null;
        for (let i = 0; i < aligned.length; i++) {
          const v = aligned[i];
          if (typeof v === "number" && Number.isFinite(v)) {
            last = v;
          } else if (last !== null) {
            aligned[i] = last;
          }
        }
      }
      outColumns[col] = aligned;
    }
  }
  return new DataFrame(outColumns);
}

export function firstLocationOfCrossingThreshold(
  df: DataFrame,
  horizon: number,
  threshold: number,
  closeColumnName: string,
  priceColumnName: string
): (number | null)[] {
  const close = df.getColumn(closeColumnName).map((v) => Number(v));
  const price = df.getColumn(priceColumnName).map((v) => Number(v));
  const out: (number | null)[] = new Array(df.length).fill(null);

  for (let i = 0; i < df.length; i++) {
    const ref = close[i];
    const thresholdPrice = ref * (1 + threshold / 100);
    let found: number | null = null;
    const limit = Math.min(df.length - 1, i + horizon);
    for (let j = i + 1; j <= limit; j++) {
      const crosses =
        threshold > 0 ? price[j] > thresholdPrice : price[j] < thresholdPrice;
      if (crosses) {
        found = j - i;
        break;
      }
    }
    out[i] = found;
  }
  return out;
}

export interface ClassificationScores {
  auc: number;
  ap: number;
  f1: number;
  precision: number;
  recall: number;
}

export function computeScores(yTrue: number[], yHat: number[]): ClassificationScores {
  const pairs = yTrue
    .map((yt, i) => ({ yt: yt ? 1 : 0, yh: yHat[i] ?? 0 }))
    .filter((p) => !Number.isNaN(p.yh));

  const yT = pairs.map((p) => p.yt);
  const yH = pairs.map((p) => p.yh);
  const yClass = yH.map((v) => (v > 0.5 ? 1 : 0));

  return {
    auc: safeAuc(yT, yH),
    ap: safeAp(yT, yH),
    f1: f1Score(yT, yClass),
    precision: precisionScore(yT, yClass),
    recall: recallScore(yT, yClass),
  };
}

function safeAuc(yTrue: number[], yHat: number[]): number {
  try {
    return round3(rocAuc(yTrue, yHat));
  } catch {
    return 0;
  }
}

function safeAp(yTrue: number[], yHat: number[]): number {
  try {
    return round3(averagePrecision(yTrue, yHat));
  } catch {
    return 0;
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function f1Score(yTrue: number[], yPred: number[]): number {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yPred[i] === 1 && yTrue[i] === 1) tp++;
    else if (yPred[i] === 1) fp++;
    else if (yTrue[i] === 1) fn++;
  }
  const p = tp + fp === 0 ? 0 : tp / (tp + fp);
  const r = tp + fn === 0 ? 0 : tp / (tp + fn);
  return round3(p + r === 0 ? 0 : (2 * p * r) / (p + r));
}

function precisionScore(yTrue: number[], yPred: number[]): number {
  let tp = 0, fp = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yPred[i] === 1 && yTrue[i] === 1) tp++;
    else if (yPred[i] === 1) fp++;
  }
  return round3(tp + fp === 0 ? 0 : tp / (tp + fp));
}

function recallScore(yTrue: number[], yPred: number[]): number {
  let tp = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yPred[i] === 1 && yTrue[i] === 1) tp++;
    else if (yTrue[i] === 1) fn++;
  }
  return round3(tp + fn === 0 ? 0 : tp / (tp + fn));
}

function rocAuc(yTrue: number[], yScores: number[]): number {
  const pos = yScores.filter((_, i) => yTrue[i] === 1);
  const neg = yScores.filter((_, i) => yTrue[i] === 0);
  if (pos.length === 0 || neg.length === 0) throw new Error("single class");
  let score = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) score += 1;
      else if (p === n) score += 0.5;
    }
  }
  return score / (pos.length * neg.length);
}

function averagePrecision(yTrue: number[], yScores: number[]): number {
  const pairs = yTrue.map((yt, i) => ({ yt, score: yScores[i] }));
  pairs.sort((a, b) => b.score - a.score);
  let tp = 0, fp = 0, ap = 0;
  const totalPos = yTrue.filter((v) => v === 1).length;
  if (totalPos === 0) throw new Error("single class");
  for (const p of pairs) {
    if (p.yt === 1) {
      tp++;
      ap += tp / (tp + fp);
    } else {
      fp++;
    }
  }
  return ap / totalPos;
}

export function resolveGeneratorName(_genName: string): null {
  return null;
}
