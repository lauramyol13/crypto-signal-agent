import { resolveKeyPrefix } from "./settings.js";

export function redisKey(key: string): string {
  return `${resolveKeyPrefix()}:${key}`;
}

/** Logical cache key (prefix applied by cache layer). */
export function signalKey(symbol: string): string {
  return `signal:${symbol}:latest`;
}

export function predictionKey(symbol: string): string {
  return `predict:${symbol}:latest`;
}

export function pipelineKey(symbol: string): string {
  return `pipeline:${symbol}:status`;
}
