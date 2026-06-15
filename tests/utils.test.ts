import { describe, it, expect } from "vitest";
import { roundDownStr, roundStr, toDecimal, computeScores } from "../src/common/utils.js";
import { generateSignals } from "../src/common/genSignals.js";
import { DataFrame } from "../src/common/dataframe.js";

describe("utils", () => {
  it("formats decimals", () => {
    expect(roundDownStr("4.1E-7", 8)).toBe("0.00000041");
    expect(roundDownStr("10.000000001", 8)).toBe("10.00000000");
    expect(roundStr("10.000000009", 8)).toBe("10.00000001");
    expect(toDecimal("4.1E-7")).toBe("0.00000041");
  });

  it("computes classification scores", () => {
    const score = computeScores([1, 0, 1, 0], [0.9, 0.1, 0.8, 0.2]);
    expect(score.f1).toBeGreaterThan(0);
    expect(score.precision).toBeGreaterThan(0);
  });
});

describe("signals", () => {
  it("generates buy/sell columns", () => {
    const df = new DataFrame({
      aaa: [222, 333, 444],
      high_60_20: [1, 2, 0],
      low_60_04: [2, 1, 1],
    });
    generateSignals(df, {
      buy: { high_60_20: 1, low_60_04: 1 },
      sell: { high_60_20: 1, low_60_04: 1 },
    });
    expect(df.getColumn("buy")).toEqual([1, 1, 0]);
    expect(df.getColumn("sell")).toEqual([0, 0, 1]);
  });
});
