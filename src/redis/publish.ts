import type { DataFrame } from "../common/dataframe.js";
import type { AppConfig } from "../common/types.js";
import { cacheSetJson } from "./cache.js";
import { ensureRedisReady, getRedisClient, isRedisEnabled } from "./client.js";
import { pipelineKey, predictionKey, signalKey } from "./keys.js";
import { getRedisSettings } from "./settings.js";

export interface SignalSnapshot {
  symbol: string;
  timestamp: string;
  close: number;
  trade_score?: number | null;
  buy_signal?: boolean;
  sell_signal?: boolean;
  freq?: string;
  updated_at: string;
}

export interface PredictionSnapshot {
  symbol: string;
  timestamp: string;
  scores: Record<string, number | null>;
  updated_at: string;
}

export interface PipelineStatus {
  symbol: string;
  step: string;
  ok: boolean;
  message?: string;
  updated_at: string;
}

function formatTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cellBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

export function buildSignalSnapshot(config: AppConfig, df: DataFrame): SignalSnapshot | null {
  if (df.length === 0) return null;
  const timeColumn = config.time_column ?? "timestamp";
  const row = df.row(df.length - 1);

  return {
    symbol: config.symbol,
    timestamp: formatTimestamp(row[timeColumn]),
    close: cellNumber(row.close) ?? 0,
    trade_score: df.hasColumn("trade_score") ? cellNumber(row.trade_score) : null,
    buy_signal: df.hasColumn("buy_signal_column") ? cellBoolean(row.buy_signal_column) : undefined,
    sell_signal: df.hasColumn("sell_signal_column") ? cellBoolean(row.sell_signal_column) : undefined,
    freq: config.freq,
    updated_at: new Date().toISOString(),
  };
}

export function buildPredictionSnapshot(
  config: AppConfig,
  df: DataFrame,
  scoreColumns: string[]
): PredictionSnapshot | null {
  if (df.length === 0) return null;
  const timeColumn = config.time_column ?? "timestamp";
  const row = df.row(df.length - 1);
  const scores: Record<string, number | null> = {};
  for (const col of scoreColumns) {
    scores[col] = df.hasColumn(col) ? cellNumber(row[col]) : null;
  }

  return {
    symbol: config.symbol,
    timestamp: formatTimestamp(row[timeColumn]),
    scores,
    updated_at: new Date().toISOString(),
  };
}

export async function publishSignalSnapshot(
  config: AppConfig,
  snapshot: SignalSnapshot
): Promise<boolean> {
  const key = signalKey(config.symbol);
  const ttl = getRedisSettings().signalTtlSec;
  await cacheSetJson(key, snapshot, ttl);

  if (isRedisEnabled()) {
    const ready = await ensureRedisReady();
    if (ready) {
      try {
        const channel = getRedisSettings().publishChannel;
        await getRedisClient().publish(channel, JSON.stringify(snapshot));
      } catch {
        return false;
      }
    }
  }
  return true;
}

export async function publishPredictionSnapshot(
  config: AppConfig,
  snapshot: PredictionSnapshot
): Promise<void> {
  const key = predictionKey(config.symbol);
  const ttl = getRedisSettings().predictionTtlSec;
  await cacheSetJson(key, snapshot, ttl);
}

export async function setPipelineStatus(
  config: AppConfig,
  step: string,
  ok: boolean,
  message?: string
): Promise<void> {
  const status: PipelineStatus = {
    symbol: config.symbol,
    step,
    ok,
    message,
    updated_at: new Date().toISOString(),
  };
  await cacheSetJson(pipelineKey(config.symbol), status, getRedisSettings().signalTtlSec);
}

export async function getSignalSnapshot(symbol: string): Promise<SignalSnapshot | null> {
  const { cacheGetJson } = await import("./cache.js");
  return cacheGetJson<SignalSnapshot>(signalKey(symbol));
}

export async function getPipelineStatus(symbol: string): Promise<PipelineStatus | null> {
  const { cacheGetJson } = await import("./cache.js");
  return cacheGetJson<PipelineStatus>(pipelineKey(symbol));
}
