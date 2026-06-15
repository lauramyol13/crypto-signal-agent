import { DataFrame, type ColumnValue } from "./dataframe.js";
import type { AlgorithmConfig } from "./types.js";

export interface StandardScaler {
  mean: number[];
  std: number[];
  featureNames: string[];
}

export interface SerializedLogisticModel {
  weights: number[];
  bias: number;
  numSteps: number;
  learningRate: number;
}

export interface LcModelPair {
  model: SerializedLogisticModel;
  scaler: StandardScaler | null;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

class BinaryLogisticRegression {
  weights: number[] = [];
  bias = 0;

  constructor(
    public numSteps: number,
    public learningRate: number
  ) {}

  train(X: number[][], y: number[]): void {
    const nFeatures = X[0]?.length ?? 0;
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;

    for (let step = 0; step < this.numSteps; step++) {
      for (let i = 0; i < X.length; i++) {
        const z = dot(this.weights, X[i]) + this.bias;
        const pred = sigmoid(z);
        const err = pred - y[i];
        for (let j = 0; j < nFeatures; j++) {
          this.weights[j] -= this.learningRate * err * X[i][j];
        }
        this.bias -= this.learningRate * err;
      }
    }
  }

  predictProba(X: number[][]): number[] {
    return X.map((row) => sigmoid(dot(this.weights, row) + this.bias));
  }

  toJSON(): SerializedLogisticModel {
    return {
      weights: [...this.weights],
      bias: this.bias,
      numSteps: this.numSteps,
      learningRate: this.learningRate,
    };
  }

  static fromJSON(data: SerializedLogisticModel): BinaryLogisticRegression {
    const model = new BinaryLogisticRegression(data.numSteps, data.learningRate);
    model.weights = [...data.weights];
    model.bias = data.bias;
    return model;
  }
}

function cellToNumber(v: ColumnValue): number {
  if (v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fitScaler(df: DataFrame, featureNames: string[]): StandardScaler {
  const mean: number[] = [];
  const std: number[] = [];
  for (const name of featureNames) {
    const values = df
      .getColumn(name)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    const s = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length) || 1;
    mean.push(m);
    std.push(s);
  }
  return { mean, std, featureNames };
}

function transformScaler(df: DataFrame, scaler: StandardScaler): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < df.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < scaler.featureNames.length; j++) {
      const v = cellToNumber(df.getColumn(scaler.featureNames[j])[i]);
      row.push(Number.isFinite(v) ? (v - scaler.mean[j]) / scaler.std[j] : NaN);
    }
    rows.push(row);
  }
  return rows;
}

export function trainLc(dfX: DataFrame, dfY: number[], modelConfig: AlgorithmConfig): LcModelPair {
  const params = modelConfig.params ?? {};
  const isScale = params.is_scale !== false;
  const featureNames = dfX.columnNames;

  let scaler: StandardScaler | null = null;
  let X = dfX.toRecords().map((r) => featureNames.map((f) => cellToNumber(r[f])));
  if (isScale) {
    scaler = fitScaler(dfX, featureNames);
    X = transformScaler(dfX, scaler);
  }

  const yValues = dfY;
  const trainRows: number[] = [];
  for (let i = 0; i < X.length; i++) {
    if (X[i].every((v) => Number.isFinite(v)) && Number.isFinite(yValues[i])) {
      trainRows.push(i);
    }
  }

  const trainConf = modelConfig.train ?? {};
  const classifier = new BinaryLogisticRegression(
    Number(trainConf.max_iter ?? 100),
    Number(trainConf.learning_rate ?? 0.01)
  );
  classifier.train(
    trainRows.map((i) => X[i]),
    trainRows.map((i) => yValues[i])
  );

  return { model: classifier.toJSON(), scaler };
}

export function predictLc(modelPair: LcModelPair, dfX: DataFrame): (number | null)[] {
  const scaler = modelPair.scaler;
  const featureNames = scaler?.featureNames ?? dfX.columnNames;
  let X = dfX.toRecords().map((r) => featureNames.map((f) => cellToNumber(r[f])));
  if (scaler) {
    X = transformScaler(dfX.selectColumns(featureNames), scaler);
  }

  const classifier = BinaryLogisticRegression.fromJSON(modelPair.model);
  const probs: (number | null)[] = [];
  for (const row of X) {
    if (row.some((v) => !Number.isFinite(v))) {
      probs.push(null);
    } else {
      probs.push(classifier.predictProba([row])[0]);
    }
  }
  return probs;
}

export function trainPredictLc(
  dfX: DataFrame,
  dfY: number[],
  dfXTest: DataFrame,
  modelConfig: AlgorithmConfig
): (number | null)[] {
  const pair = trainLc(dfX, dfY, modelConfig);
  return predictLc(pair, dfXTest);
}
