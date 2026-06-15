import { DataFrame } from "./dataframe.js";
import { firstLocationOfCrossingThreshold } from "./utils.js";

interface Highlow2Config {
  columns: string[];
  function: "high" | "low";
  thresholds: number | number[];
  tolerance: number;
  horizon: number;
  names: string[];
}

export function generateLabelsHighlow2(
  df: DataFrame,
  config: Highlow2Config
): [DataFrame, string[]] {
  const [closeColumn, highColumn, lowColumn] = config.columns;
  let thresholds = Array.isArray(config.thresholds)
    ? config.thresholds
    : [config.thresholds];

  let priceColumns: [string, string];
  if (config.function === "high") {
    thresholds = thresholds.map((t) => Math.abs(t));
    priceColumns = [highColumn, lowColumn];
  } else {
    thresholds = thresholds.map((t) => -Math.abs(t));
    priceColumns = [lowColumn, highColumn];
  }

  const tolerances = thresholds.map((t) => Math.round(-t * config.tolerance * 1e6) / 1e6);
  const labels: string[] = [];

  for (let i = 0; i < thresholds.length; i++) {
    firstCrossLabels(
      df,
      config.horizon,
      [thresholds[i], tolerances[i]],
      closeColumn,
      priceColumns,
      config.names[i]
    );
    labels.push(config.names[i]);
  }

  return [df, labels];
}

function firstCrossLabels(
  df: DataFrame,
  horizon: number,
  thresholds: [number, number],
  closeColumn: string,
  priceColumns: [string, string],
  outColumn: string
): void {
  const firstIdx = firstLocationOfCrossingThreshold(
    df,
    horizon,
    thresholds[0],
    closeColumn,
    priceColumns[0]
  );
  const secondIdx = firstLocationOfCrossingThreshold(
    df,
    horizon,
    thresholds[1],
    closeColumn,
    priceColumns[1]
  );

  const result: boolean[] = [];
  for (let i = 0; i < df.length; i++) {
    const a = firstIdx[i];
    const b = secondIdx[i];
    if (a === null || a === undefined) {
      result.push(false);
    } else if (b === null || b === undefined) {
      result.push(true);
    } else {
      result.push(a <= b);
    }
  }
  df.setColumn(outColumn, result);
}
