export enum Venue {
  YAHOO = "yahoo",
  BINANCE = "binance",
  MT5 = "mt5",
}

export class AccountBalances {
  base_quantity = "0.04108219";
  quote_quantity = "1000.0";
}

export interface DataSourceConfig {
  folder?: string;
  file?: string;
  column_prefix?: string;
  df?: import("./dataframe.js").DataFrame;
  start?: Date;
  end?: Date;
}

export interface FeatureSetConfig {
  column_prefix?: string;
  generator: string;
  feature_prefix?: string;
  config: Record<string, unknown>;
}

export interface AlgorithmConfig {
  name: string;
  algo: string;
  params?: Record<string, unknown>;
  train?: Record<string, unknown>;
}

export interface AppConfig {
  train?: boolean;
  venue?: string;
  api_key?: string;
  api_secret?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  data_folder: string;
  symbol: string;
  description?: string;
  freq: string;
  label_horizon?: number;
  features_horizon?: number;
  train_length?: number;
  predict_length?: number;
  append_overlap_records?: number;
  download_max_rows?: number;
  merge_interpolate?: boolean;
  merge_file_name?: string;
  feature_file_name?: string;
  matrix_file_name?: string;
  predict_file_name?: string;
  signal_file_name?: string;
  signal_models_file_name?: string;
  model_folder?: string;
  time_column?: string;
  data_sources?: DataSourceConfig[];
  feature_sets?: FeatureSetConfig[];
  label_sets?: FeatureSetConfig[];
  train_feature_sets?: FeatureSetConfig[];
  train_features?: string[];
  labels?: string[];
  algorithms?: AlgorithmConfig[];
  signal_sets?: FeatureSetConfig[];
  output_sets?: FeatureSetConfig[];
  model_registry?: Array<{ name: string; file: string }>;
  client_args?: Record<string, string>;
  [key: string]: unknown;
}
