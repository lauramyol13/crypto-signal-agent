import fs from "node:fs";
import path from "node:path";
import type { AppConfig, AlgorithmConfig } from "./types.js";
import type { LcModelPair } from "./classifierLc.js";

export const LABEL_ALGO_SEPARATOR = "_";

export class ModelStore {
  config: AppConfig;
  modelPath: string;
  modelRegistry: Array<{ name: string; file: string }>;
  modelPairs: Record<string, LcModelPair> = {};
  models: Record<string, unknown> = {};

  constructor(config: AppConfig) {
    this.config = config;
    const symbol = config.symbol;
    const dataPath = path.join(config.data_folder, symbol);
    let modelPath = config.model_folder ?? "MODELS";
    if (!path.isAbsolute(modelPath)) {
      modelPath = path.join(dataPath, modelPath);
    }
    this.modelPath = path.resolve(modelPath);
    this.modelRegistry = config.model_registry ?? [];
  }

  loadModels(): void {
    this.modelPairs = this.loadModelsForGenerators();
    for (const entry of this.modelRegistry) {
      const modelPath = path.join(this.modelPath, entry.file);
      if (fs.existsSync(modelPath)) {
        this.models[entry.name] = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
      }
    }
  }

  getModelPair(columnName: string): LcModelPair {
    const pair = this.modelPairs[columnName];
    if (!pair) throw new Error(`Model not found: ${columnName}`);
    return pair;
  }

  putModelPair(columnName: string, modelPair: LcModelPair): void {
    this.modelPairs[columnName] = modelPair;
    this.saveLabelAlgoModelPair(columnName, modelPair);
  }

  private loadModelsForGenerators(): Record<string, LcModelPair> {
    const labelsDefault = this.config.labels ?? [];
    const trainFeatureSets = this.config.train_feature_sets ?? [];
    const models: Record<string, LcModelPair> = {};

    for (const fs of trainFeatureSets) {
      const labels = (fs.config.labels as string[] | undefined) ?? labelsDefault;
      const algorithmNames =
        (fs.config.functions as string[] | undefined) ??
        (fs.config.algorithms as string[] | undefined) ??
        [];
      const algorithms = resolveAlgorithmsForGenerator(
        algorithmNames,
        this.config.algorithms ?? []
      );

      for (const label of labels) {
        for (const algo of algorithms) {
          const scoreColumnName = `${label}${LABEL_ALGO_SEPARATOR}${algo.name}`;
          try {
            models[scoreColumnName] = this.loadLabelAlgoModelPair(scoreColumnName);
          } catch {
            console.error(`ERROR: Cannot load model ${scoreColumnName}. Skip.`);
          }
        }
      }
    }
    return models;
  }

  private loadLabelAlgoModelPair(scoreColumnName: string): LcModelPair {
    const scalerPath = path.join(this.modelPath, `${scoreColumnName}.scaler.json`);
    const modelPath = path.join(this.modelPath, `${scoreColumnName}.model.json`);
    const scaler = JSON.parse(fs.readFileSync(scalerPath, "utf-8"));
    const model = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
    return { model, scaler };
  }

  private saveLabelAlgoModelPair(columnName: string, modelPair: LcModelPair): void {
    fs.mkdirSync(this.modelPath, { recursive: true });
    fs.writeFileSync(
      path.join(this.modelPath, `${columnName}.scaler.json`),
      JSON.stringify(modelPair.scaler, null, 2)
    );
    fs.writeFileSync(
      path.join(this.modelPath, `${columnName}.model.json`),
      JSON.stringify(modelPair.model, null, 2)
    );
  }
}

export function resolveAlgorithmsForGenerator(
  algorithmNames: string[],
  algorithmsDefault: AlgorithmConfig[]
): AlgorithmConfig[] {
  if (algorithmNames.length === 0) return algorithmsDefault;
  return algorithmNames.map((name) => findAlgorithmByName(algorithmsDefault, name));
}

export function findAlgorithmByName(
  algorithms: AlgorithmConfig[],
  name: string
): AlgorithmConfig {
  const found = algorithms.find((a) => a.name === name);
  if (!found) throw new Error(`Algorithm '${name}' not found`);
  return found;
}

export function scoreToLabelAlgoPair(scoreColumnName: string): [string, string] {
  const idx = scoreColumnName.lastIndexOf(LABEL_ALGO_SEPARATOR);
  return [scoreColumnName.slice(0, idx), scoreColumnName.slice(idx + 1)];
}
