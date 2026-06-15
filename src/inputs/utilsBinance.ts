export function binanceFreqFromPandas(freq: string): string {
  let out = freq;
  if (out.endsWith("min")) out = out.replace("min", "m");
  else if (out.endsWith("D")) out = out.replace("D", "d");
  else if (out.endsWith("W")) out = out.replace("W", "w");
  else if (out === "BMS") out = out.replace("BMS", "M");

  if (out.length === 1) out = `1${out}`;

  if (
    out.length < 2 ||
    out.length > 3 ||
    !/^\d/.test(out) ||
    !["m", "h", "d", "w", "M"].includes(out.slice(-1))
  ) {
    throw new Error(`Not supported Binance frequency ${freq}`);
  }
  return out;
}

export function pandasIntervalLengthMs(freq: string): number {
  const match = freq.match(/^(\d+)(min|h|D|W|MS)$/);
  if (!match) throw new Error(`Unsupported pandas frequency ${freq}`);
  const amount = Number(match[1]);
  const unit = match[2];
  const minute = 60_000;
  switch (unit) {
    case "min":
      return amount * minute;
    case "h":
      return amount * 60 * minute;
    case "D":
      return amount * 24 * 60 * minute;
    case "W":
      return amount * 7 * 24 * 60 * minute;
    case "MS":
      return amount * 30 * 24 * 60 * minute;
    default:
      throw new Error(`Unknown unit ${unit}`);
  }
}
