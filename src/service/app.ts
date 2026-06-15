import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../common/types.js";
import { AccountBalances } from "../common/types.js";
import { ModelStore } from "../common/modelStore.js";
import { DataFrame } from "../common/dataframe.js";
import { applyRedisConfig } from "../redis/settings.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class App {
  static errorStatus: unknown = 0;
  static serverStatus: unknown = 0;
  static accountStatus: unknown = 0;
  static tradeStateStatus: unknown = 0;
  static df: DataFrame | null = null;
  static accountInfo: AccountBalances = new AccountBalances();
  static modelStore: ModelStore | null = null;

  static config: AppConfig = {
    venue: "",
    api_key: "",
    api_secret: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
    merge_file_name: "data.csv",
    feature_file_name: "features.csv",
    matrix_file_name: "matrix.csv",
    predict_file_name: "predictions.csv",
    signal_file_name: "signals.csv",
    signal_models_file_name: "signal_models",
    model_folder: "MODELS",
    time_column: "timestamp",
    data_folder: "C:/DATA_ITB",
    symbol: "BTCUSDT",
    freq: "1min",
    data_sources: [],
    feature_sets: [],
    label_sets: [],
    train_feature_sets: [],
    train_features: [],
    labels: [],
    algorithms: [],
    signal_sets: [],
    label_horizon: 0,
    features_horizon: 10,
    redis: {
      enabled: false,
      key_prefix: "itb",
      signal_ttl_sec: 3600,
      prediction_ttl_sec: 3600,
      publish_channel: "itb:signals",
    },
  };
}

export function loadConfig(configFile: string): void {
  if (!configFile) return;
  const configPath = path.isAbsolute(configFile)
    ? configFile
    : path.join(PACKAGE_ROOT, configFile);
  const raw = fs.readFileSync(configPath, "utf-8");
  const withoutComments = raw.replace(/\/\/.*$/gm, "");
  const parsed = JSON.parse(withoutComments) as Partial<AppConfig>;
  Object.assign(App.config, parsed);
  applyRedisConfig(App.config.redis);
}

export function dataProviderProblemsExist(): boolean {
  return App.errorStatus !== 0 || App.serverStatus !== 0;
}

export function problemsExist(): boolean {
  return (
    App.errorStatus !== 0 ||
    App.serverStatus !== 0 ||
    App.accountStatus !== 0 ||
    App.tradeStateStatus !== 0
  );
}

export { PACKAGE_ROOT };
