import { describe, it, expect } from "vitest";
import { DataFrame } from "../src/common/dataframe.js";
import { trainPredictLc } from "../src/common/classifierLc.js";

describe("classifierLc", () => {
  it("handles NaN rows in prediction input", () => {
    const dfX = new DataFrame({
      x: [1, 2, 3, 2, 1],
      y: [0, 1, 0, 1, 0],
    });
    const dfXTest = new DataFrame({
      x: [1, 2, null, 2, null],
      y: [0, 1, 0, 1, 0],
    });

    const result = trainPredictLc(
      dfX.selectColumns(["x"]),
      dfX.getColumn("y").map(Number),
      dfXTest.selectColumns(["x"]),
      {
        name: "lc",
        algo: "lc",
        params: { is_scale: true },
        train: { max_iter: 50, learning_rate: 0.05 },
      }
    );

    expect(result.length).toBe(5);
    expect(result.filter((v) => v === null).length).toBe(2);
  });
});
