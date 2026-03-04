export type OHLCPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartStock = {
  symbol: string;
  companyName: string;
  exchange: string;
  currency: string;
  marketCap: string;
  peRatio: number;
  dividendYield: number;
  ohlc: OHLCPoint[];
};

export type RawHistoricalRow = Record<string, string | number>;

function extractValue(row: RawHistoricalRow, field: "Open" | "High" | "Low" | "Close" | "Volume") {
  const key = Object.keys(row).find((item) => item.includes(`('${field}',`));
  if (!key) {
    return undefined;
  }
  const value = row[key];
  return typeof value === "number" ? value : Number(value);
}

function extractDate(row: RawHistoricalRow) {
  const key = Object.keys(row).find((item) => item.includes("('Date'"));
  if (!key) {
    return undefined;
  }
  const value = row[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function normalizeHistoricalRows(rows: RawHistoricalRow[]): OHLCPoint[] {
  return rows
    .map((row) => {
      const date = extractDate(row);
      const open = extractValue(row, "Open");
      const high = extractValue(row, "High");
      const low = extractValue(row, "Low");
      const close = extractValue(row, "Close");
      const volume = extractValue(row, "Volume");

      if (
        !date ||
        open === undefined ||
        high === undefined ||
        low === undefined ||
        close === undefined ||
        volume === undefined
      ) {
        return null;
      }

      return {
        date,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter((point): point is OHLCPoint => point !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function buildSeries(base: number, drift: number): OHLCPoint[] {
  const points: OHLCPoint[] = [];
  const today = new Date();
  const days = 252 * 5;
  let prev = base;

  for (let i = days; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const wave = Math.sin(i / 21) * 1.2 + Math.cos(i / 37) * 0.9;
    const next = Math.max(1, prev * (1 + (drift + wave) / 100));
    const high = Math.max(prev, next) * 1.01;
    const low = Math.min(prev, next) * 0.99;
    points.push({
      date: d.toISOString(),
      open: Number(prev.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(next.toFixed(2)),
      volume: 100000 + ((i * 917) % 70000),
    });
    prev = next;
  }

  return points;
}

export const chartStocksSample: ChartStock[] = [
  {
    symbol: "RELIANCE",
    companyName: "Reliance Industries Ltd",
    exchange: "NSE",
    currency: "USD",
    marketCap: "300.05B",
    peRatio: 23.02,
    dividendYield: 2.18,
    ohlc: buildSeries(120, 0.03),
  },
  {
    symbol: "ASIANPAINT",
    companyName: "Asian Paints Ltd",
    exchange: "BSE",
    currency: "USD",
    marketCap: "43.81B",
    peRatio: 58.4,
    dividendYield: 1.22,
    ohlc: buildSeries(90, 0.025),
  },
  {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
    currency: "USD",
    marketCap: "3.10T",
    peRatio: 31.7,
    dividendYield: 0.45,
    ohlc: buildSeries(140, 0.028),
  },
];
