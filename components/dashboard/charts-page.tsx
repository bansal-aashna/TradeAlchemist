"use client";

import { memo, useMemo, useState } from "react";
import type { ChartStock } from "@/lib/sample-data/chart-stocks";

type ChartsPageProps = {
  stocks: ChartStock[];
};
const rangeOptions = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"] as const;
type RangeOption = (typeof rangeOptions)[number];

function formatCurrency(value: number | undefined, currency: string) {
  if (value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChartDate(value: string | undefined) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatAxisDate(value: string | undefined) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
  }).format(date);
}

function chartPath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return { path: "", min: 0, max: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return { path, min, max };
}

function getSeriesByRange(series: ChartStock["ohlc"], range: RangeOption) {
  if (series.length === 0) {
    return series;
  }

  const lastDate = new Date(series[series.length - 1].date);
  const from = new Date(lastDate);

  if (range === "1D") {
    from.setDate(lastDate.getDate() - 1);
  } else if (range === "5D") {
    from.setDate(lastDate.getDate() - 5);
  } else if (range === "1M") {
    from.setMonth(lastDate.getMonth() - 1);
  } else if (range === "6M") {
    from.setMonth(lastDate.getMonth() - 6);
  } else if (range === "YTD") {
    from.setMonth(0, 1);
  } else if (range === "1Y") {
    from.setFullYear(lastDate.getFullYear() - 1);
  } else {
    from.setFullYear(lastDate.getFullYear() - 5);
  }

  return series.filter((point) => new Date(point.date) >= from);
}

export const ChartsPage = memo(function ChartsPage({ stocks }: ChartsPageProps) {
  const exchanges = useMemo(
    () => Array.from(new Set(stocks.map((stock) => stock.exchange))),
    [stocks],
  );
  const [selectedExchange, setSelectedExchange] = useState<string>(
    exchanges[0] ?? "",
  );
  const [query, setQuery] = useState("");
  const [activeRange, setActiveRange] = useState<RangeOption>("5Y");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return stocks.filter((stock) => {
      const exchangeMatch = selectedExchange
        ? stock.exchange === selectedExchange
        : true;
      if (!text) {
        return exchangeMatch;
      }
      return (
        exchangeMatch &&
        (stock.symbol.toLowerCase().includes(text) ||
          stock.companyName.toLowerCase().includes(text))
      );
    });
  }, [stocks, selectedExchange, query]);

  const selected = filtered[0] ?? stocks[0];
  const rangeSeries = getSeriesByRange(selected?.ohlc ?? [], activeRange);
  const closes = rangeSeries.map((row) => row.close) ?? [];
  const geometry = chartPath(closes, 980, 280);
  const d = geometry.path;
  const latest = rangeSeries[rangeSeries.length - 1];
  const first = rangeSeries[0];
  const diff = latest && first ? latest.close - first.close : 0;
  const diffPct = first && first.close !== 0 ? (diff / first.close) * 100 : 0;
  const tone = diff >= 0 ? "positive" : "negative";
  const high52w = Math.max(...(selected?.ohlc.slice(-252).map((row) => row.high) ?? [0]));
  const low52w = Math.min(...(selected?.ohlc.slice(-252).map((row) => row.low) ?? [0]));
  const activePoint =
    hoverIndex !== null && rangeSeries[hoverIndex] ? rangeSeries[hoverIndex] : latest;
  const chartDate = formatChartDate(activePoint?.date);
  const chartPrice = activePoint?.close;

  const yTicks = useMemo(() => {
    if (closes.length === 0) {
      return ["--", "--", "--", "--", "--"];
    }
    const min = geometry.min;
    const max = geometry.max;
    const step = (max - min) / 4;
    return Array.from({ length: 5 }, (_, index) =>
      (max - step * index).toFixed(0),
    );
  }, [closes, geometry.max, geometry.min]);

  const xTicks = useMemo(() => {
    if (rangeSeries.length === 0) {
      return ["--", "--", "--", "--", "--"];
    }
    const idx = [0, 0.25, 0.5, 0.75, 1].map((factor) =>
      Math.min(rangeSeries.length - 1, Math.round((rangeSeries.length - 1) * factor)),
    );
    return idx.map((i) => formatAxisDate(rangeSeries[i]?.date));
  }, [rangeSeries]);

  const hoverX =
    hoverIndex !== null && rangeSeries.length > 1
      ? (hoverIndex / (rangeSeries.length - 1)) * 980
      : null;
  const hoverY =
    hoverIndex !== null && activePoint
      ? 280 -
        ((activePoint.close - geometry.min) / Math.max(1, geometry.max - geometry.min)) * 280
      : null;
  const hoverXPct = hoverX !== null ? (hoverX / 980) * 100 : null;
  const hoverYPct = hoverY !== null ? (hoverY / 280) * 100 : null;
  const tooltipXPct =
    hoverXPct !== null ? Math.min(92, Math.max(8, hoverXPct + 2)) : 78;
  const tooltipYPct =
    hoverYPct !== null ? Math.min(78, Math.max(8, hoverYPct - 10)) : 12;

  return (
    <section className="ta-dashboard-content ta-charts-page">
      <div className="ta-buy-search-card">
        <div className="ta-buy-search-row">
          <div className="ta-buy-select-wrap">
            <select
              className="ta-buy-select"
              value={selectedExchange}
              onChange={(event) => setSelectedExchange(event.target.value)}
            >
              {exchanges.map((exchange) => (
                <option key={exchange} value={exchange}>
                  {exchange}
                </option>
              ))}
            </select>
            <span className="ta-buy-select-arrow">▾</span>
          </div>

          <div className="ta-buy-search-input-wrap">
            <span className="ta-buy-search-icon">⌕</span>
            <input
              className="ta-buy-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search stock by symbol or company"
            />
            {query ? (
              <button
                type="button"
                className="ta-buy-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                x
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <article className="ta-dashboard-section-card ta-charts-shell">
        <p className="ta-charts-price">
          {formatCurrency(latest?.close, selected?.currency ?? "USD")}{" "}
          <span>{selected?.currency ?? "USD"}</span>
        </p>
        <p className={`ta-charts-change ${tone}`}>
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(2)} ({diffPct.toFixed(2)}%) {diff >= 0 ? "▲" : "▼"} past{" "}
          {activeRange === "5Y" ? "5 years" : activeRange}
        </p>

        <div className="ta-charts-ranges">
          {rangeOptions.map((range) => (
            <button
              key={range}
              type="button"
              className={`ta-charts-range-btn ${activeRange === range ? "active" : ""}`}
              onClick={() => setActiveRange(range)}
            >
              {range}
            </button>
          ))}
        </div>

        <div className="ta-charts-plot-wrap">
          {hoverX !== null && hoverY !== null ? (
            <>
              <div className="ta-charts-crosshair ta-charts-crosshair-v" style={{ left: `${hoverXPct}%` }} />
              <div className="ta-charts-crosshair ta-charts-crosshair-h" style={{ top: `${hoverYPct}%` }} />
            </>
          ) : null}

          <div
            className="ta-charts-tooltip"
            style={{ left: `${tooltipXPct}%`, top: `${tooltipYPct}%` }}
          >
            {formatCurrency(chartPrice, selected?.currency ?? "USD")} {chartDate}
          </div>

          <svg
            viewBox="0 0 980 280"
            className="ta-charts-plot"
            role="img"
            aria-label="5 year price chart"
            onMouseMove={(event) => {
              if (rangeSeries.length < 2) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - bounds.left;
              const ratio = Math.max(0, Math.min(1, x / bounds.width));
              setHoverIndex(Math.round(ratio * (rangeSeries.length - 1)));
            }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="taChartsFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(22,163,74,0.38)" />
                <stop offset="100%" stopColor="rgba(22,163,74,0.04)" />
              </linearGradient>
            </defs>
            <path d={`${d} L980,280 L0,280 Z`} fill="url(#taChartsFill)" />
            <path d={d} className="ta-charts-line" />
          </svg>
                  <div className="ta-charts-axis-y">
                    {yTicks.map((tick, index) => (
                      <span key={`${tick}-${index}`}>{tick}</span>
                    ))}
                  </div>
          <div className="ta-charts-axis-x">
            {xTicks.map((tick, index) => (
              <span key={`${tick}-${index}`}>{tick}</span>
            ))}
          </div>
        </div>

        <div className="ta-charts-stats-grid">
          <p>Open</p>
          <p>{formatCurrency(latest?.open, selected?.currency ?? "USD")}</p>
          <p>Mkt cap</p>
          <p>{selected?.marketCap ?? "--"}</p>
          <p>Dividend</p>
          <p>{selected ? `${selected.dividendYield.toFixed(2)}%` : "--"}</p>

          <p>High</p>
          <p>{formatCurrency(latest?.high, selected?.currency ?? "USD")}</p>
          <p>P/E ratio</p>
          <p>{selected ? selected.peRatio.toFixed(2) : "--"}</p>
          <p>52-wk high</p>
          <p>{formatCurrency(high52w, selected?.currency ?? "USD")}</p>

          <p>Low</p>
          <p>{formatCurrency(latest?.low, selected?.currency ?? "USD")}</p>
          <p>52-wk low</p>
          <p>{formatCurrency(low52w, selected?.currency ?? "USD")}</p>
          <p>Volume</p>
          <p>{latest?.volume?.toLocaleString() ?? "--"}</p>
        </div>
      </article>
    </section>
  );
});
