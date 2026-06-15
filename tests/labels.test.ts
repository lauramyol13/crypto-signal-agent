import { describe, it, expect } from "vitest";
import { DataFrame } from "../src/common/dataframe.js";
import { generateLabelsHighlow2 } from "../src/common/genLabelsHighlow.js";

describe("labels", () => {
  it("generates highlow2 boolean labels", () => {
    const n = 120;
    const close: number[] = [];
    const high: number[] = [];
    const low: number[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
      const bump = i > 40 && i < 50 ? 3 : 0.1;
      price += bump;
      close.push(price);
      high.push(price + 1);
      low.push(price - 1);
    }
    const df = new DataFrame({ close, high, low });
    const [, labels] = generateLabelsHighlow2(df, {
      columns: ["close", "high", "low"],
      function: "high",
      thresholds: [2.0],
      tolerance: 0.2,
      horizon: 20,
      names: ["high_20"],
    });
    expect(labels).toEqual(["high_20"]);
    expect(df.hasColumn("high_20")).toBe(true);
  });
});
