export type ColumnValue = number | boolean | string | Date | null | undefined;

export class DataFrame {
  private _columns: Map<string, ColumnValue[]>;

  constructor(columns: Record<string, ColumnValue[]> = {}) {
    this._columns = new Map();
    for (const [name, values] of Object.entries(columns)) {
      this._columns.set(name, [...values]);
    }
  }

  get length(): number {
    if (this._columns.size === 0) return 0;
    return Math.max(...[...this._columns.values()].map((c) => c.length));
  }

  get columnNames(): string[] {
    return [...this._columns.keys()];
  }

  hasColumn(name: string): boolean {
    return this._columns.has(name);
  }

  getColumn(name: string): ColumnValue[] {
    const col = this._columns.get(name);
    if (!col) {
      throw new Error(`Column '${name}' not found`);
    }
    return col;
  }

  setColumn(name: string, values: ColumnValue[]): this {
    this._columns.set(name, [...values]);
    return this;
  }

  addColumn(name: string, values: ColumnValue[]): this {
    return this.setColumn(name, values);
  }

  dropColumns(names: string[]): this {
    for (const name of names) {
      this._columns.delete(name);
    }
    return this;
  }

  selectColumns(names: string[]): DataFrame {
    const out: Record<string, ColumnValue[]> = {};
    for (const name of names) {
      if (this.hasColumn(name)) {
        out[name] = [...this.getColumn(name)];
      }
    }
    return new DataFrame(out);
  }

  row(index: number): Record<string, ColumnValue> {
    const row: Record<string, ColumnValue> = {};
    for (const name of this.columnNames) {
      row[name] = this.getColumn(name)[index];
    }
    return row;
  }

  tail(n: number): DataFrame {
    const start = Math.max(0, this.length - n);
    return this.slice(start, this.length);
  }

  head(n: number): DataFrame {
    return this.slice(0, n);
  }

  slice(start: number, end?: number): DataFrame {
    const out: Record<string, ColumnValue[]> = {};
    for (const name of this.columnNames) {
      out[name] = this.getColumn(name).slice(start, end);
    }
    return new DataFrame(out);
  }

  resetIndex(): DataFrame {
    return this.clone();
  }

  clone(): DataFrame {
    const out: Record<string, ColumnValue[]> = {};
    for (const name of this.columnNames) {
      out[name] = [...this.getColumn(name)];
    }
    return new DataFrame(out);
  }

  join(other: DataFrame): DataFrame {
    const out = this.clone();
    for (const name of other.columnNames) {
      out.setColumn(name, other.getColumn(name));
    }
    return out;
  }

  dropNa(subset?: string[]): DataFrame {
    const cols = subset ?? this.columnNames;
    const keep: number[] = [];
    for (let i = 0; i < this.length; i++) {
      const hasNa = cols.some((c) => {
        const v = this.getColumn(c)[i];
        return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
      });
      if (!hasNa) keep.push(i);
    }
    const out: Record<string, ColumnValue[]> = {};
    for (const name of this.columnNames) {
      out[name] = keep.map((i) => this.getColumn(name)[i]);
    }
    return new DataFrame(out);
  }

  replaceInfWithNaN(): this {
    for (const name of this.columnNames) {
      const col = this.getColumn(name).map((v) => {
        if (typeof v === "number" && (!Number.isFinite(v))) return null;
        return v;
      });
      this.setColumn(name, col);
    }
    return this;
  }

  nullCount(column: string): number {
    return this.getColumn(column).filter(
      (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))
    ).length;
  }

  anyNullInColumns(columns: string[]): boolean[] {
    const result: boolean[] = [];
    for (let i = 0; i < this.length; i++) {
      result.push(
        columns.some((c) => {
          const v = this.getColumn(c)[i];
          return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
        })
      );
    }
    return result;
  }

  static fromRecords(records: Record<string, ColumnValue>[]): DataFrame {
    if (records.length === 0) return new DataFrame();
    const columns: Record<string, ColumnValue[]> = {};
    for (const key of Object.keys(records[0])) {
      columns[key] = records.map((r) => r[key]);
    }
    return new DataFrame(columns);
  }

  toRecords(): Record<string, ColumnValue>[] {
    const records: Record<string, ColumnValue>[] = [];
    for (let i = 0; i < this.length; i++) {
      records.push(this.row(i));
    }
    return records;
  }
}

export function interpolateColumn(values: ColumnValue[]): number[] {
  const nums = values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN));
  let lastValid: number | null = null;
  for (let i = 0; i < nums.length; i++) {
    if (!Number.isNaN(nums[i])) {
      lastValid = nums[i];
    } else if (lastValid !== null) {
      nums[i] = lastValid;
    }
  }
  let nextValid: number | null = null;
  for (let i = nums.length - 1; i >= 0; i--) {
    if (!Number.isNaN(nums[i])) {
      nextValid = nums[i];
    } else if (nextValid !== null) {
      nums[i] = nextValid;
    }
  }
  return nums;
}

export function rollingMean(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < Math.max(1, Math.floor(window / 2))) {
      out.push(null);
      continue;
    }
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    if (slice.length < Math.max(1, Math.floor(window / 2))) {
      out.push(null);
    } else {
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
  }
  return out;
}

export function rollingStd(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    if (slice.length < Math.max(1, Math.floor(window / 2))) {
      out.push(null);
      continue;
    }
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    out.push(Math.sqrt(variance));
  }
  return out;
}

export function rollingLinearRegSlope(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    if (slice.length < Math.max(1, Math.floor(window / 2))) {
      out.push(null);
      continue;
    }
    const n = slice.length;
    const xs = Array.from({ length: n }, (_, j) => j);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = slice.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let j = 0; j < n; j++) {
      num += (xs[j] - xMean) * (slice[j] - yMean);
      den += (xs[j] - xMean) ** 2;
    }
    out.push(den === 0 ? 0 : num / den);
  }
  return out;
}
