import { DataFrame } from "./dataframe.js";
import type { ModelStore } from "./modelStore.js";
import type { AppConfig } from "./types.js";

export function myFeatureExample(
  df: DataFrame,
  config: Record<string, unknown>,
  _globalConfig: AppConfig,
  _modelStore: ModelStore
): [DataFrame, string[]] {
  const columnName = config.columns as string;
  const fn = config.function as "add" | "mul";
  const parameter = Number(config.parameter);
  let names = config.names as string | undefined;
  if (!names) names = `${columnName}_${fn}`;

  const col = df.getColumn(columnName).map((v) => Number(v));
  const result =
    fn === "add" ? col.map((v) => v + parameter) : col.map((v) => v * parameter);
  df.setColumn(names, result);
  console.log(`Finished computing feature '${names}'`);
  return [df, [names]];
}
