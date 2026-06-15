import { DataFrame } from "./dataframe.js";

export function generateSmoothenScores(
  df: DataFrame,
  config: Record<string, unknown>
): [DataFrame, string[]] {
  let columns = config.columns as string | string[];
  if (typeof columns === "string") columns = [columns];
  const names = config.names as string;
  const window = config.window as number | undefined;
  const pointThreshold = config.point_threshold as number | undefined;

  const means: number[] = [];
  for (let i = 0; i < df.length; i++) {
    const vals = columns
      .map((c) => Number(df.getColumn(c)[i]))
      .filter((v) => Number.isFinite(v));
    means.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN);
  }

  let out = means.map((v) =>
    pointThreshold !== undefined ? (v >= pointThreshold ? 1 : 0) : v
  );

  if (window !== undefined) {
    const smoothed: number[] = [];
    for (let i = 0; i < out.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = out.slice(start, i + 1);
      if (slice.length < Math.max(1, Math.floor(window / 2))) {
        smoothed.push(NaN);
      } else {
        smoothed.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
    }
    out = smoothed;
  }

  df.setColumn(names, out);
  return [df, [names]];
}

export function generateCombineScores(
  df: DataFrame,
  config: Record<string, unknown>
): [DataFrame, string[]] {
  const columns = config.columns as string[];
  const outColumn = config.names as string;
  const [upColumn, downColumn] = columns;

  const combined: number[] = [];
  for (let i = 0; i < df.length; i++) {
    const up = Number(df.getColumn(upColumn)[i]);
    const down = Number(df.getColumn(downColumn)[i]);
    if (config.combine === "relative") {
      const sum = up + down;
      combined.push(sum === 0 ? 0 : (up / sum) * 2 - 1);
    } else if (config.combine === "difference") {
      combined.push(up - down);
    } else {
      combined.push(up >= down ? up : -down);
    }
  }

  let result = combined;
  if (config.coefficient) {
    const c = Number(config.coefficient);
    result = result.map((v) => v * c);
  }
  if (config.constant) {
    const k = Number(config.constant);
    result = result.map((v) => v + k);
  }

  df.setColumn(outColumn, result);
  return [df, [outColumn]];
}

export function generateThresholdRule(
  df: DataFrame,
  config: Record<string, unknown>
): [DataFrame, string[]] {
  const parameters = config.parameters as Record<string, number>;
  const columns = config.columns as string | string[];
  const col = Array.isArray(columns) ? columns[0] : columns;
  const names = config.names as string[];
  const buyCol = names[0];
  const sellCol = names[1];

  const buy: boolean[] = [];
  const sell: boolean[] = [];
  for (let i = 0; i < df.length; i++) {
    const v = Number(df.getColumn(col)[i]);
    buy.push(v >= parameters.buy_signal_threshold);
    sell.push(v <= parameters.sell_signal_threshold);
  }
  df.setColumn(buyCol, buy);
  df.setColumn(sellCol, sell);
  return [df, [buyCol, sellCol]];
}

export function generateSignals(
  df: DataFrame,
  models: Record<string, Record<string, number>>
): string[] {
  for (const [signal, model] of Object.entries(models)) {
    const values: number[] = [];
    for (let i = 0; i < df.length; i++) {
      const row = df.row(i);
      let ok = 1;
      for (const [field, threshold] of Object.entries(model)) {
        const val = Number(row[field]);
        if (signal === "buy" && val < threshold) ok = 0;
        if (signal === "sell" && val > threshold) ok = 0;
      }
      values.push(ok);
    }
    df.setColumn(signal, values);
  }
  return Object.keys(models);
}
