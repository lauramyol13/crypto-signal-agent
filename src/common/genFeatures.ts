import {
  DataFrame,
  interpolateColumn,
  rollingLinearRegSlope,
  rollingMean,
  rollingStd,
} from "./dataframe.js";

interface TalibConfig {
  columns?: string | string[] | Record<string, string>;
  functions?: string | string[];
  windows?: number | number[];
  names?: string | string[];
}

export function generateFeaturesTalib(
  df: DataFrame,
  config: TalibConfig,
  _lastRows = 0
): string[] {
  let columnNames = config.columns ?? "close";
  let colName: string;
  if (typeof columnNames === "string") {
    colName = columnNames;
  } else if (Array.isArray(columnNames)) {
    colName = columnNames[0];
  } else {
    colName = Object.values(columnNames)[0];
  }

  const values = interpolateColumn(df.getColumn(colName)).map((v) => Number(v));
  const funcNames = Array.isArray(config.functions)
    ? config.functions
    : [config.functions ?? "SMA"];
  const windows = Array.isArray(config.windows)
    ? config.windows
    : [config.windows ?? 5];

  const features: string[] = [];
  for (const funcName of funcNames) {
    for (let j = 0; j < windows.length; j++) {
      const w = windows[j];
      let outName = `${colName}_${funcName}_${w}`;
      if (typeof config.names === "string") {
        outName = `${colName}_${funcName}_${config.names}_${w}`;
      } else if (Array.isArray(config.names)) {
        outName = `${colName}_${funcName}_${config.names[j]}`;
      }

      let result: (number | null)[];
      if (w === 1 && funcName === "SMA") {
        result = values;
      } else if (funcName === "SMA") {
        result = rollingMean(values, w);
      } else if (funcName === "STDDEV") {
        result = rollingStd(values, w);
      } else if (funcName === "LINEARREG_SLOPE") {
        result = rollingLinearRegSlope(values, w);
      } else {
        throw new Error(`Unsupported talib function '${funcName}'`);
      }

      df.setColumn(outName, result);
      features.push(outName);
    }
  }
  return features;
}
