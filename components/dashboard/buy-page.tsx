"use client";

import { memo, useMemo, useState } from "react";
import type { TradeDraft } from "@/components/dashboard/trade-modal";

const buyExchanges = [
  "NSE",
  "BSE",
  "NASDAQ",
  "NYSE",
  "Shanghai Stock Exchange",
  "Hong Kong Stock Exchange",
  "Tokyo Stock Exchange",
  "London Stock Exchange",
  "Australian Stock Exchange",
  "Toronto Stock Exchange",
] as const;

type BuyExchange = (typeof buyExchanges)[number];

type BuyStock = {
  symbol: string;
  companyName: string;
  exchange: string;
  currentPrice?: number;
  change?: number;
  percentChange?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prevClose?: number;
  volume?: number;
};

type BuyPageProps = {
  stocks?: BuyStock[];
  onTradeAction: (trade: TradeDraft) => void;
};

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

function formatChange(value: number | undefined, withPercent?: boolean) {
  if (value === undefined) {
    return "--";
  }
  const prefix = value > 0 ? "+" : "";
  if (withPercent) {
    return `${prefix}${value.toFixed(2)}%`;
  }
  return `${prefix}${value.toFixed(2)}`;
}

export const BuyPage = memo(function BuyPage({ stocks = [], onTradeAction }: BuyPageProps) {
  const [selectedExchange, setSelectedExchange] = useState<BuyExchange>("NSE");
  const [query, setQuery] = useState("");

  const filteredStocks = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    return stocks.filter((stock) => {
      const matchesExchange = stock.exchange === selectedExchange;
      if (!trimmed) {
        return matchesExchange;
      }
      return (
        matchesExchange &&
        (stock.symbol.toLowerCase().includes(trimmed) ||
          stock.companyName.toLowerCase().includes(trimmed))
      );
    });
  }, [stocks, selectedExchange, query]);

  const selectedStock = filteredStocks[0];
  const priceTone =
    selectedStock?.change === undefined
      ? "neutral"
      : selectedStock.change >= 0
        ? "positive"
        : "negative";

  return (
    <section className="ta-dashboard-content ta-buy-page">
      <h2 className="ta-buy-title">Buy Stocks</h2>
      <p className="ta-buy-subtitle">Search for stocks to purchase and add to your portfolio.</p>

      <div className="ta-buy-search-card">
        <div className="ta-buy-search-row">
          <div className="ta-buy-select-wrap">
            <select
              className="ta-buy-select"
              value={selectedExchange}
              onChange={(event) =>
                setSelectedExchange(event.target.value as BuyExchange)
              }
            >
              {buyExchanges.map((exchange) => (
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

      <div className="ta-buy-selected-card">
        <div>
          <p className="ta-buy-selected-symbol">{selectedStock?.symbol ?? "--"}</p>
          <p className="ta-buy-selected-company">{selectedStock?.companyName ?? "--"}</p>
        </div>
        <div className="ta-buy-selected-price-block">
          <p className="ta-buy-selected-price">{formatCurrency(selectedStock?.currentPrice)}</p>
          <p className={`ta-buy-selected-change ${priceTone}`}>
            {formatChange(selectedStock?.change)} ({formatChange(selectedStock?.percentChange, true)})
          </p>
        </div>
      </div>

      <div className="ta-buy-layout-grid">
        <article className="ta-buy-panel ta-buy-chart-panel">
          <h3 className="ta-buy-panel-title">Historical Performance</h3>
          <div className="ta-buy-chart-placeholder">
            <div className="ta-buy-chart-line" />
          </div>
        </article>

        <div className="ta-buy-side-column">
          <article className="ta-buy-panel ta-buy-actions-panel">
            <div className="ta-buy-actions-row">
              <button
                type="button"
                className="ta-buy-action-btn buy"
                disabled={!selectedStock}
                onClick={() => {
                  if (!selectedStock?.currentPrice) {
                    return;
                  }
                  onTradeAction({
                    ticker: selectedStock.symbol,
                    company: selectedStock.companyName,
                    price: selectedStock.currentPrice,
                    type: "buy",
                  });
                }}
              >
                Buy
              </button>
              <button
                type="button"
                className="ta-buy-action-btn sell"
                disabled={!selectedStock}
                onClick={() => {
                  if (!selectedStock?.currentPrice) {
                    return;
                  }
                  onTradeAction({
                    ticker: selectedStock.symbol,
                    company: selectedStock.companyName,
                    price: selectedStock.currentPrice,
                    type: "sell",
                    maxShares: 5,
                  });
                }}
              >
                Sell
              </button>
            </div>
          </article>

          <article className="ta-buy-panel ta-buy-stats-panel">
            <h3 className="ta-buy-panel-title">Key Statistics</h3>
            <div className="ta-buy-stats-grid">
              <p>Open</p>
              <p>{formatCurrency(selectedStock?.open)}</p>

              <p>High</p>
              <p>{formatCurrency(selectedStock?.high)}</p>

              <p>Low</p>
              <p>{formatCurrency(selectedStock?.low)}</p>

              <p>Close</p>
              <p>{formatCurrency(selectedStock?.close)}</p>

              <p>Previous Close</p>
              <p>{formatCurrency(selectedStock?.prevClose)}</p>

              <p>Volume</p>
              <p>
                {selectedStock?.volume
                  ? new Intl.NumberFormat("en-US").format(selectedStock.volume)
                  : "--"}
              </p>

              <p>Market Cap</p>
              <p>--</p>

              <p>P/E Ratio</p>
              <p>--</p>

              <p>Dividend Yield</p>
              <p>--</p>

              <p>52-Week High</p>
              <p>--</p>

              <p>52-Week Low</p>
              <p>--</p>

              <p>Sector</p>
              <p>--</p>

              <p>Industry</p>
              <p>--</p>
            </div>
          </article>
        </div>
      </div>

      {query.trim() && filteredStocks.length === 0 ? (
        <p className="ta-market-watch-note">
          No matching stocks. Connect your dataset to load searchable stocks.
        </p>
      ) : null}

    </section>
  );
});
