"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";
import type { TradeDraft } from "@/components/dashboard/trade-modal";
import type { TransactionRecord } from "@/components/dashboard/transaction-history-table";
import { searchStocks, getStockHistory, type ApiOHLCPoint, type ApiStock, type ApiWatchlistItem } from "@/lib/api";

const rangeOptions = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"] as const;
type RangeOption = (typeof rangeOptions)[number];
import { EXCHANGE_OPTIONS, type ExchangeId } from "@/lib/exchanges";
import type { DashboardTab } from "@/components/dashboard/tabs";

type DashboardHomeProps = {
  holdings?: PortfolioHolding[];
  transactions: TransactionRecord[];
  watchlist: ApiWatchlistItem[];
  isDarkMode: boolean;
  onTradeAction: (trade: TradeDraft) => void;
  onAddWatchlist: (item: ApiWatchlistItem) => Promise<void>;
  onRemoveWatchlist: (item: ApiWatchlistItem) => Promise<void>;
  onPreviewNavigate: (tab: DashboardTab) => void;
  priceRefreshVersion?: number;
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatCurrency(value: number | undefined) {
  if (value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyByCode(value: number | undefined, currency = "USD") {
  if (value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getTone(value: number | undefined) {
  if (value === undefined) {
    return "";
  }
  return value < 0 ? "negative" : "positive";
}

function formatChartDate(value: string | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatAxisDate(value: string | undefined, range: RangeOption) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  if (range === "1D") {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  } else if (range === "5D" || range === "1M") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  } else if (range === "6M" || range === "YTD" || range === "1Y") {
    return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  } else {
    return new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  }
}

function getSeriesByRange(series: ApiOHLCPoint[], range: RangeOption) {
  if (series.length === 0) return series;
  const lastDate = new Date(series[series.length - 1].date);
  const from = new Date(lastDate);
  if (range === "1D") from.setDate(lastDate.getDate() - 1);
  else if (range === "5D") from.setDate(lastDate.getDate() - 5);
  else if (range === "1M") from.setMonth(lastDate.getMonth() - 1);
  else if (range === "6M") from.setMonth(lastDate.getMonth() - 6);
  else if (range === "YTD") from.setMonth(0, 1);
  else if (range === "1Y") from.setFullYear(lastDate.getFullYear() - 1);
  else from.setFullYear(lastDate.getFullYear() - 5);
  return series.filter((point) => new Date(point.date) >= from);
}

function toChartPath(values: number[], width: number, height: number) {
  if (values.length === 0) return { path: "", min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return { path, min, max };
}

export const DashboardHome = memo(function DashboardHome({
  holdings,
  transactions,
  watchlist,
  isDarkMode,
  onTradeAction,
  onAddWatchlist,
  onRemoveWatchlist,
  onPreviewNavigate,
  priceRefreshVersion = 0,
}: DashboardHomeProps) {
  const [stocks, setStocks] = useState<ApiStock[]>([]);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeId>(EXCHANGE_OPTIONS[0].id);
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const [activeRange, setActiveRange] = useState<RangeOption>("1Y");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [historySeries, setHistorySeries] = useState<ApiOHLCPoint[]>([]);

  useEffect(() => {
    let active = true;

    const loadStocks = async () => {
      try {
        const results = await searchStocks({
          exchange: selectedExchange,
          q: query.trim() || undefined,
        });
        if (!active) {
          return;
        }
        setStocks(results);
        setSearchError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setStocks([]);
        setSearchError(error instanceof Error ? error.message : "Stock search failed.");
      }
    };

    const timeout = window.setTimeout(loadStocks, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [selectedExchange, query, priceRefreshVersion]);

  const filteredStocks = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return stocks.filter((stock) => {
      const matchesSearch = trimmed
        ? stock.symbol.toLowerCase().includes(trimmed) ||
          stock.companyName.toLowerCase().includes(trimmed)
        : true;
      return matchesSearch;
    });
  }, [stocks, selectedExchange, query]);

  useEffect(() => {
    if (filteredStocks.length === 0 || !query.trim()) {
      setSelectedSymbol("");
      return;
    }
    const hasCurrentSelection = filteredStocks.some((stock) => stock.symbol === selectedSymbol);
    if (!hasCurrentSelection) {
      setSelectedSymbol("");
    }
  }, [filteredStocks, query, selectedSymbol]);

  const selectedStock = useMemo(
    () => filteredStocks.find((stock) => stock.symbol === selectedSymbol),
    [filteredStocks, selectedSymbol],
  );
  const stockCurrency = selectedStock?.currency ?? "USD";
  const recentTransactions = transactions.slice(0, 5);
  const previewHoldings = holdings?.slice(0, 5) ?? [];

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      if (!selectedStock?.symbol) {
        setHistorySeries([]);
        return;
      }
      try {
        const results = await getStockHistory({
          symbol: selectedStock.symbol,
          range: activeRange,
        });
        if (active) setHistorySeries(results);
      } catch {
        if (active) setHistorySeries([]);
      }
    };

    if (!selectedStock?.symbol) {
      setHistorySeries([]);
      return;
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [selectedStock?.symbol, activeRange, priceRefreshVersion]);

  const chartRangeSeries = useMemo(
    () => getSeriesByRange(historySeries, activeRange),
    [historySeries, activeRange],
  );
  const latestHistoryPoint = chartRangeSeries[chartRangeSeries.length - 1];
  const { path: chartPath, min: chartMin, max: chartMax } = useMemo(() => {
    const chartCloses = chartRangeSeries.map((point) => point.close);
    return toChartPath(chartCloses, 940, 300);
  }, [chartRangeSeries]);

  const chartTail = chartRangeSeries[chartRangeSeries.length - 1]?.close ?? 0;
  const chartHead = chartRangeSeries[0]?.close ?? 0;
  const diff = chartTail - chartHead;
  const diffPct = chartHead !== 0 ? (diff / chartHead) * 100 : 0;
  const tone = diff >= 0 ? "positive" : "negative";

  const activePoint =
    hoverIndex !== null && chartRangeSeries[hoverIndex]
      ? chartRangeSeries[hoverIndex]
      : chartRangeSeries[chartRangeSeries.length - 1];
  const chartDate = formatChartDate(activePoint?.date);
  const chartTailPrice = activePoint?.close;
  const hoverX =
    hoverIndex !== null && chartRangeSeries.length > 1
      ? (hoverIndex / (chartRangeSeries.length - 1)) * 940
      : null;
  const hoverY =
    hoverIndex !== null && activePoint
      ? 300 -
      ((activePoint.close - chartMin) / Math.max(1, chartMax - chartMin)) *
      300
      : null;
  const prevCloseY =
    selectedStock?.prevClose !== undefined && chartMax > chartMin
      ? 300 - ((selectedStock.prevClose - chartMin) / (chartMax - chartMin)) * 300
      : null;

  const hoverXPct = hoverX !== null ? (hoverX / 940) * 100 : null;
  const hoverYPct = hoverY !== null ? (hoverY / 300) * 100 : null;
  const tooltipXPct = hoverXPct !== null ? Math.min(92, Math.max(8, hoverXPct + 2)) : null;
  const tooltipYPct = hoverYPct !== null ? Math.min(78, Math.max(8, hoverYPct - 10)) : null;

  const yTicks = useMemo(() => {
    if (chartRangeSeries.length === 0) return ["--", "--", "--", "--", "--"];
    const min = chartMin;
    const max = chartMax;
    const step = (max - min) / 4;
    return Array.from({ length: 5 }, (_, index) => (max - step * index).toFixed(0));
  }, [chartRangeSeries.length, chartMax, chartMin]);

  const xTicks = useMemo(() => {
    if (chartRangeSeries.length === 0) return ["--", "--", "--", "--", "--"];
    const idx = [0, 0.25, 0.5, 0.75, 1].map((factor) =>
      Math.min(chartRangeSeries.length - 1, Math.round((chartRangeSeries.length - 1) * factor)),
    );
    return idx.map((i) => formatAxisDate(chartRangeSeries[i]?.date, activeRange));
  }, [chartRangeSeries, activeRange]);

  return (
    <section className="ta-dashboard-content ta-dashboard-home">
      <h2>Dashboard</h2>

      <div className="ta-dh-main-grid-2col">
        <div className="ta-dh-left">
          <article className="ta-dashboard-section-card">
            <h3 className="ta-holdings-title">Search and Buy</h3>
        <div className="ta-buy-search-card">
          <div className="ta-buy-search-row">
            <div className="ta-buy-select-wrap">
              <select
                className="ta-buy-select"
                value={selectedExchange}
                onChange={(event) => {
                  setSelectedExchange(event.target.value as ExchangeId);
                  setQuery("");
                  setSelectedSymbol("");
                }}
              >
                {EXCHANGE_OPTIONS.map((exchange) => (
                  <option key={exchange.id} value={exchange.id}>
                    {exchange.label}
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
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedSymbol("");
                }}
                placeholder="Search stock by symbol or company"
              />
              {query ? (
                <button
                  type="button"
                  className="ta-buy-search-clear"
                  onClick={() => {
                    setQuery("");
                    setSelectedSymbol("");
                  }}
                  aria-label="Clear search"
                >
                  x
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {query.trim() && !selectedSymbol ? (
          <div className="ta-watch-search-results">
            {filteredStocks.length > 0 ? (
              filteredStocks.slice(0, 12).map((stock) => (
                <button
                  key={`${stock.exchange}-${stock.symbol}`}
                  type="button"
                  className="ta-watch-result-item"
                  onClick={() => {
                    setSelectedSymbol(stock.symbol);
                    setQuery(stock.symbol);
                  }}
                >
                  <div>
                    <p className="ta-watch-preview-symbol">{stock.symbol}</p>
                    <p className="ta-watch-preview-name">{stock.companyName}</p>
                  </div>
                  <span className="ta-watch-result-exchange">{stock.exchange}</span>
                </button>
              ))
            ) : searchError ? (
              <p className="ta-market-watch-note">{searchError}</p>
            ) : (
              <p className="ta-market-watch-note">No matching stocks from backend.</p>
            )}
          </div>
        ) : null}

          </article>

        {selectedStock ? (
          <div className="ta-dh-selected-grid">
            {/* Chart Column */}
            <article className="ta-dashboard-section-card" style={{ padding: '1.25rem' }}>
              <div className="ta-buy-selected-card ta-dashboard-selected-row" style={{ marginTop: 0, paddingBottom: '1rem', borderBottom: '1px solid var(--border-secondary)' }}>
                <div>
                  <p className="ta-buy-selected-symbol">{selectedStock.symbol}</p>
                  <p className="ta-buy-selected-company">{selectedStock.companyName}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="ta-buy-selected-price">{formatCurrencyByCode(selectedStock.currentPrice, stockCurrency)}</p>
                  <p className={`ta-charts-change ${tone}`} style={{ fontSize: '0.9rem', margin: 0 }}>
                    {diff >= 0 ? "+" : ""}
                    {diff.toFixed(2)} ({diffPct.toFixed(2)}%)
                  </p>
                </div>
              </div>

              <div className="ta-buy-chart-placeholder" style={{ marginTop: '1rem', border: 'none', background: 'transparent' }}>
                <div className="ta-buy-chart-live">
                  <div className="ta-charts-ranges">
                    {rangeOptions.map((range) => (
                      <button
                        key={range}
                        type="button"
                        className={`ta-charts-range-btn ${activeRange === range ? "active" : ""}`}
                        onClick={() => {
                          setActiveRange(range);
                          setHoverIndex(null);
                        }}
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

                    {hoverIndex !== null && tooltipXPct !== null && tooltipYPct !== null ? (
                    <div className="ta-charts-tooltip" style={{ left: `${tooltipXPct}%`, top: `${tooltipYPct}%` }}>
                      {formatCurrencyByCode(chartTailPrice, stockCurrency)} {chartDate}
                    </div>
                    ) : null}

                    <svg
                      viewBox="0 0 940 300"
                      className="ta-charts-plot"
                      role="img"
                      aria-label={`${selectedStock.symbol} historical performance`}
                      onMouseMove={(event) => {
                        if (chartRangeSeries.length < 2) return;
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const x = event.clientX - bounds.left;
                        const ratio = Math.max(0, Math.min(1, x / bounds.width));
                        setHoverIndex(Math.round(ratio * (chartRangeSeries.length - 1)));
                      }}
                      onMouseLeave={() => setHoverIndex(null)}
                    >
                      <defs>
                        <linearGradient id="taBuyChartFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={diff >= 0 ? "rgba(26,115,232,0.12)" : "rgba(230,64,54,0.12)"} />
                          <stop offset="100%" stopColor={diff >= 0 ? "rgba(26,115,232,0)" : "rgba(230,64,54,0)"} />
                        </linearGradient>
                      </defs>
                      {prevCloseY !== null && !isNaN(prevCloseY) ? (
                        <line
                          x1="0" y1={prevCloseY}
                          x2="940" y2={prevCloseY}
                          stroke="var(--border-secondary)"
                          strokeDasharray="4 4"
                          strokeWidth="1.5"
                        />
                      ) : null}
                      <path d={`${chartPath} L940,300 L0,300 Z`} fill="url(#taBuyChartFill)" />
                      <path d={chartPath} className={`ta-charts-line ${tone}`} />
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
                </div>
              </div>
            </article>

            {/* Trade Column */}
            <article className="ta-dashboard-section-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 className="ta-holdings-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Trade {selectedStock.symbol}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Place buy or sell orders for this stock.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="ta-buy-action-btn ta-trade-pill buy"
                  style={{ width: '100%', minHeight: '44px', justifyContent: 'center' }}
                  disabled={!selectedStock.currentPrice}
                  onClick={() => {
                    if (!selectedStock.currentPrice) return;
                    onTradeAction({
                      ticker: selectedStock.symbol,
                      company: selectedStock.companyName,
                      exchange: selectedStock.exchange,
                      price: selectedStock.currentPrice,
                      type: "buy",
                    });
                  }}
                >
                  Buy
                </button>
                <button
                  type="button"
                  className="ta-buy-action-btn ta-trade-pill sell"
                  style={{ width: '100%', minHeight: '44px', justifyContent: 'center' }}
                  disabled={!selectedStock.currentPrice || !(holdings?.find(h => h.ticker === selectedStock.symbol)?.quantity)}
                  onClick={() => {
                    if (!selectedStock.currentPrice) return;
                    const maxShares = holdings?.find(h => h.ticker === selectedStock.symbol)?.quantity ?? 0;
                    if (maxShares <= 0) return;
                    onTradeAction({
                      ticker: selectedStock.symbol,
                      company: selectedStock.companyName,
                      exchange: selectedStock.exchange,
                      price: selectedStock.currentPrice,
                      type: "sell",
                      maxShares
                    });
                  }}
                >
                  Sell
                </button>
                <button
                  type="button"
                  className="ta-watch-add-btn"
                  style={{ width: '100%', minHeight: '44px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() =>
                    onAddWatchlist({
                      ticker: selectedStock.symbol,
                      companyName: selectedStock.companyName,
                      exchange: selectedStock.exchange,
                    })
                  }
                >
                  + Add to Watchlist
                </button>
              </div>
            </article>
          </div>
        ) : (
          <div className="ta-dh-selected-grid">
            <article className="ta-dashboard-section-card ta-buy-chart-placeholder" style={{ padding: '1.25rem' }}>
              <div className="ta-buy-chart-line" />
            </article>
            <article className="ta-dashboard-section-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.4, pointerEvents: 'none' }}>
              <div>
                <h3 className="ta-holdings-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Trade</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Select a stock to trade.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="ta-buy-action-btn ta-trade-pill buy" style={{ width: '100%', minHeight: '44px', justifyContent: 'center' }} disabled>Buy</button>
                <button type="button" className="ta-buy-action-btn ta-trade-pill sell" style={{ width: '100%', minHeight: '44px', justifyContent: 'center' }} disabled>Sell</button>
                <button type="button" className="ta-watch-add-btn" style={{ width: '100%', minHeight: '44px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontWeight: 600 }} disabled>+ Add to Watchlist</button>
              </div>
            </article>
          </div>
        )}

        </div> {/* Close ta-dh-left */}

        <div className="ta-dh-right">
          {/* Watchlist */}
          <article className="ta-dashboard-section-card">
            <button
              type="button"
              className="ta-preview-link"
              onClick={() => onPreviewNavigate("Market Watch")}
            >
              <h3 className="ta-holdings-title">Watchlist Preview</h3>
            </button>
            <div className="ta-holdings-table-wrap">
              <table className="ta-holdings-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Company</th>
                    <th>Exchange</th>
                    <th>Current Price</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.length > 0 ? (
                    watchlist.map((stock) => (
                      <tr key={`${stock.exchange}-${stock.ticker}`}>
                        <td>{stock.ticker}</td>
                        <td>{stock.companyName}</td>
                        <td>{stock.exchange}</td>
                        <td>{formatCurrencyByCode(stock.currentPrice)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="ta-holdings-empty">
                        Add stocks from search to preview watchlist.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Portfolio Holdings */}
          <article className="ta-dashboard-section-card">
            <button
              type="button"
              className="ta-preview-link"
              onClick={() => onPreviewNavigate("Portfolio")}
            >
              <h3 className="ta-holdings-title">All Holdings</h3>
            </button>
            <div className="ta-holdings-table-wrap">
              <table className="ta-holdings-table">
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Current Price</th>
                    <th>Hold Price</th>
                    <th>Total P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {previewHoldings.length > 0 ? (
                    previewHoldings.map((holding) => (
                      <tr key={holding.ticker}>
                        <td>
                          <p className="ta-holding-ticker">{holding.ticker}</p>
                          <p className="ta-holding-qty">Qty: {holding.quantity ?? "--"}</p>
                        </td>
                        <td>{formatCurrency(holding.currentPrice)}</td>
                        <td>{formatCurrency(holding.holdPrice)}</td>
                        <td className={getTone(holding.totalPL)}>
                          {formatCurrency(holding.totalPL)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="ta-holdings-empty">
                        No holdings available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="ta-dashboard-section-card">
            <button
              type="button"
              className="ta-preview-link"
              onClick={() => onPreviewNavigate("Transaction History")}
            >
              <h3 className="ta-holdings-title">Recent Transactions</h3>
            </button>
            <div className="ta-holdings-table-wrap">
              <table className="ta-holdings-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ticker</th>
                    <th>Type</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.length > 0 ? (
                    recentTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td style={{ fontSize: '0.85rem' }}>{formatDateTime(transaction.dateTime)}</td>
                        <td>{transaction.ticker}</td>
                        <td>
                          <span className={`ta-type-pill ${transaction.type}`}>
                            {transaction.type.toUpperCase()}
                          </span>
                        </td>
                        <td>{formatCurrency(transaction.shares * transaction.price)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="ta-holdings-empty">
                        No recent transactions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
});
