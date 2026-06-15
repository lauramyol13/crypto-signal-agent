import { DataFrame } from "./dataframe.js";
import { generateFeaturesTalib } from "./genFeatures.js";
import { generateLabelsHighlow2 } from "./genLabelsHighlow.js";
import {
  generateCombineScores,
  generateSmoothenScores,
  generateThresholdRule,
} from "./genSignals.js";
import { myFeatureExample } from "./myFeatureExample.js";
import { trainLc, predictLc } from "./classifierLc.js";
import {
  findAlgorithmByName,
  LABEL_ALGO_SEPARATOR,
  type ModelStore,
} from "./modelStore.js";
import type { AlgorithmConfig, AppConfig, FeatureSetConfig } from "./types.js";

type GeneratorFn = (
  df: DataFrame,
  config: Record<string, unknown>,
  globalConfig: AppConfig,
  modelStore: ModelStore
) => [DataFrame, string[]];

const CUSTOM_GENERATORS: Record<string, GeneratorFn> = {
  "common.my_feature_example:my_feature_example": myFeatureExample,
};

export function generateFeatureSet(
  df: DataFrame,
  fs: FeatureSetConfig,
  config: AppConfig,
  modelStore: ModelStore,
  lastRows = 0
): [DataFrame, string[]] {
  const cp = fs.column_prefix;
  let fDf: DataFrame;
  if (cp) {
    const prefix = `${cp}_`;
    const cols = df.columnNames.filter((c) => c.startsWith(prefix));
    const renamed: Record<string, ReturnType<DataFrame["getColumn"]>> = {};
    for (const c of cols) {
      renamed[c.slice(prefix.length)] = df.getColumn(c);
    }
    fDf = new DataFrame(renamed);
  } else {
    fDf = df.clone();
  }

  const generator = fs.generator;
  const genConfig = fs.config;
  let features: string[] = [];

  if (generator === "talib") {
    features = generateFeaturesTalib(fDf, genConfig, lastRows);
  } else if (generator === "highlow2") {
    [, features] = generateLabelsHighlow2(
      fDf,
      genConfig as unknown as Parameters<typeof generateLabelsHighlow2>[1]
    );
  } else if (generator === "smoothen") {
    [, features] = generateSmoothenScores(fDf, genConfig);
  } else if (generator === "combine") {
    [, features] = generateCombineScores(fDf, genConfig);
  } else if (generator === "threshold_rule") {
    [, features] = generateThresholdRule(fDf, genConfig);
  } else if (CUSTOM_GENERATORS[generator]) {
    [fDf, features] = CUSTOM_GENERATORS[generator](fDf, genConfig, config, modelStore);
  } else {
    throw new Error(`Unknown feature generator: ${generator}`);
  }

  const fp = fs.feature_prefix;
  if (fp) {
    for (const name of features) {
      const renamed = `${fp}_${name}`;
      fDf.setColumn(renamed, fDf.getColumn(name));
      if (renamed !== name) fDf.dropColumns([name]);
    }
    features = features.map((n) => `${fp}_${n}`);
  }

  for (const name of features) {
    if (df.hasColumn(name)) df.dropColumns([name]);
    df.setColumn(name, fDf.getColumn(name));
  }

  return [df, features];
}

export function trainFeatureSet(
  df: DataFrame,
  fs: FeatureSetConfig,
  config: AppConfig
): Record<string, import("./classifierLc.js").LcModelPair> {
  const [trainFeatures, labels, algorithms] = getFeaturesLabelsAlgorithms(fs, config);
  let trainDf = df.dropNa([...trainFeatures, ...labels]);

  const models: Record<string, import("./classifierLc.js").LcModelPair> = {};

  for (const label of labels) {
    for (const modelConfig of algorithms) {
      const algoName = modelConfig.name;
      const algoType = modelConfig.algo;
      const scoreColumnName = `${label}${LABEL_ALGO_SEPARATOR}${algoName}`;

      let slice = trainDf;
      const everyNth = modelConfig.params?.every_nth_row as number | undefined;
      if (everyNth) {
        const cols: Record<string, ReturnType<DataFrame["getColumn"]>> = {};
        for (const c of slice.columnNames) {
          cols[c] = slice.getColumn(c).filter((_, i) => i % everyNth === 0);
        }
        slice = new DataFrame(cols);
      }
      const length = modelConfig.params?.length as number | undefined;
      if (length) slice = slice.tail(length);

      const dfX = slice.selectColumns(trainFeatures);
      const dfY = slice.getColumn(label).map((v) => Number(v));

      console.log(
        `Train '${scoreColumnName}'. Algorithm ${algoName}. Label: ${label}. Train length ${slice.length}.`
      );

      if (algoType === "lc") {
        models[scoreColumnName] = trainLc(dfX, dfY, modelConfig);
      } else {
        throw new Error(`Unknown algorithm type ${algoType}`);
      }
    }
  }
  return models;
}

export function predictFeatureSet(
  df: DataFrame,
  fs: FeatureSetConfig,
  config: AppConfig,
  modelStore: ModelStore
): [DataFrame, string[]] {
  const [trainFeatures, labels, algorithms] = getFeaturesLabelsAlgorithms(fs, config);
  const dfX = df.selectColumns(trainFeatures);
  const features: string[] = [];
  const out = new DataFrame();

  for (const label of labels) {
    for (const modelConfig of algorithms) {
      const algoName = modelConfig.name;
      const algoType = modelConfig.algo;
      const scoreColumnName = `${label}${LABEL_ALGO_SEPARATOR}${algoName}`;
      const modelPair = modelStore.getModelPair(scoreColumnName);

      console.log(
        `Predict '${scoreColumnName}'. Algorithm ${algoName}. Label: ${label}. Rows ${dfX.length}.`
      );

      if (algoType === "lc") {
        out.setColumn(scoreColumnName, predictLc(modelPair, dfX));
      } else {
        throw new Error(`Unknown algorithm type ${algoType}`);
      }
      features.push(scoreColumnName);
    }
  }
  return [out, features];
}

export function getFeaturesLabelsAlgorithms(
  fs: FeatureSetConfig,
  config: AppConfig
): [string[], string[], AlgorithmConfig[]] {
  const trainFeaturesAll = config.train_features ?? [];
  let trainFeatures =
    (fs.config.columns as string[] | undefined) ??
    (fs.config.features as string[] | undefined) ??
    trainFeaturesAll;

  const labelsAll = config.labels ?? [];
  let labels = (fs.config.labels as string[] | undefined) ?? labelsAll;

  const algorithmsAll = config.algorithms ?? [];
  let algorithmNames =
    (fs.config.functions as string[] | undefined) ??
    (fs.config.algorithms as string[] | undefined) ??
    [];

  let algorithms: AlgorithmConfig[] = [];
  if (algorithmNames.length) {
    algorithms = algorithmNames.map((name) => {
      if (typeof name === "string") return findAlgorithmByName(algorithmsAll, name);
      return name as unknown as AlgorithmConfig;
    });
  } else {
    algorithms = algorithmsAll;
  }

  if (typeof trainFeatures === "string") trainFeatures = [trainFeatures];
  return [trainFeatures, labels, algorithms];
}
