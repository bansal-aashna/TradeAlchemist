"use client";

import { memo, useMemo, useState } from "react";
import type { TradeDraft } from "@/components/dashboard/trade-modal";

type StockMeta = {
  symbol: string;
  companyName: string;
  exchange: string;
  lastPrice: number;
  currentPrice: number;
  change: number;
  percentChange: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
};

type MarketWatchProps = {
  stocks?: StockMeta[];
  isDarkMode: boolean;
  onTradeAction: (trade: TradeDraft) => void;
};

const sampleStocks: StockMeta[] = [
  {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
    lastPrice: 2875.50,
    currentPrice: 2890.20,
    change: 18.75,
    percentChange: 0.66,
    open: 2850.00,
    dayHigh: 2892.00,
    dayLow: 2841.20,
    volume: 4123456,
  },

  {
    symbol: "TSLA",
    companyName: "Tesla Inc.",
    exchange: "NASDAQ",
    lastPrice: 2875.50,
    currentPrice: 2890.20,
    change: 18.75,
    percentChange: 0.66,
    open: 2850.00,
    dayHigh: 2892.00,
    dayLow: 2841.20,
    volume: 4123456,

  },
  {
    symbol: "RELIANCE",
    companyName: "Reliance Industries Ltd.",
    exchange: "NSE",
    lastPrice: 2875.50,
    currentPrice: 2890.20,
    change: -18.75,
    percentChange: -0.66,
    open: 2850.00,
    dayHigh: 2892.00,
    dayLow: 2841.20,
    volume: 4123456,

  },
];

export const MarketWatch = memo(function MarketWatch({
  stocks = sampleStocks,
  isDarkMode,
  onTradeAction,
}: MarketWatchProps) {

  const [query, setQuery] = useState("");
  const [watchlistStocks, setWatchlistStocks] = useState<StockMeta[]>([]);

  const filteredStocks = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }

    return stocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(trimmed) ||
        stock.companyName.toLowerCase().includes(trimmed) ||
        stock.exchange.toLowerCase().includes(trimmed),
    );
  }, [query, stocks]);

  const addToWatchlist = (stock: StockMeta) => {
    setWatchlistStocks((previous) => {
      const exists = previous.some(
        (item) => item.symbol === stock.symbol && item.exchange === stock.exchange,
      );
      if (exists) {
        return previous;
      }
      return [...previous, stock];
    });
  };

  const removeFromWatchlist = (symbol: string, exchange: string) => {
    setWatchlistStocks((previous) =>
      previous.filter((item) => !(item.symbol === symbol && item.exchange === exchange)),
    );
  };

  return (
    <section className="ta-dashboard-content">
      <div className="ta-market-watch-new">

        <h2 className="ta-watch-main-title">Market Watch</h2>

        <div className="ta-watch-search-card">
          <div className="ta-watch-search-input-wrap">
            <span className="ta-watch-search-icon">⌕</span>

            <input
              className="ta-watch-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ticker to watch..."
            />

            {query ? (
              <button
                type="button"
                className="ta-watch-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                x
              </button>
            ) : null}

          </div>
        </div>



        {query.trim() ? (
          <div className="ta-watch-search-results">
            {filteredStocks.length > 0 ? (
              filteredStocks.map((stock) => (
                <article key={`${stock.exchange}-${stock.symbol}`} className="ta-watch-result-item">
                  <div>
                    <p className="ta-watch-preview-symbol">{stock.symbol}</p>
                    <p className="ta-watch-preview-name">
                      {stock.companyName} ({stock.exchange})
                    </p>
                  </div>
                  <button type="button" className="ta-watch-add-btn" onClick={() => addToWatchlist(stock)}>
                    +
                  </button>
                </article>
              ))
            ) : (
              <p className="ta-market-watch-note">
                No matching stocks found. Connect stock metadata to enable search results.
              </p>
            )}
          </div>
        ) : (
          <p className="ta-market-watch-note">
            No backend connected yet. Once your stock metadata is wired, results will appear here.
          </p>
        )}

        <div className="ta-holdings-table-wrap">
          <table className="ta-holdings-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Company Name</th>
                <th>Exchange</th>
                <th>Last Price</th>
                <th>Current Price</th>
                <th>Change</th>
                <th>% Change</th>
                <th>Open</th>
                <th>Day High</th>
                <th>Day Low</th>
                <th>Volume</th>
                <th>Trade</th>
                <th>Delete</th>

              </tr>
            </thead>
            <tbody>
              {watchlistStocks.length > 0 ? (
                watchlistStocks.map((stock) => (
                  <tr key={`${stock.exchange}-${stock.symbol}`}>
                    <td>{stock.symbol}</td>
                    <td>{stock.companyName}</td>
                    <td>{stock.exchange}</td>

                    <td>{stock.lastPrice.toFixed(2)}</td>

                    <td className={stock.currentPrice >= stock.open ? "positive" : "negative"}>
                      {stock.currentPrice.toFixed(2)}
                    </td>

                    <td className={stock.change >= 0 ? "positive" : "negative"}>
                      {stock.change >= 0 ? "▲" : "▼"} {stock.change.toFixed(2)}
                    </td>

                    <td className={stock.percentChange >= 0 ? "positive" : "negative"}>
                      {stock.percentChange >= 0 ? "+" : ""}
                      {stock.percentChange.toFixed(2)}%
                    </td>

                    <td>{stock.open.toFixed(2)}</td>
                    <td>{stock.dayHigh.toFixed(2)}</td>
                    <td>{stock.dayLow.toFixed(2)}</td>
                    <td>{stock.volume.toLocaleString()}</td>

                    <td>
                      <div className="ta-trade-cell">
                        <button
                          type="button"
                          className="ta-table-action"
                          onClick={() =>
                            onTradeAction({
                              ticker: stock.symbol,
                              company: stock.companyName,
                              price: stock.currentPrice,
                              type: "buy",
                            })
                          }
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          className="ta-table-action danger"
                          onClick={() =>
                            onTradeAction({
                              ticker: stock.symbol,
                              company: stock.companyName,
                              price: stock.currentPrice,
                              type: "sell",
                              maxShares: 5,
                            })
                          }
                        >
                          Sell
                        </button>
                      </div>
                    </td>

                    {/* DELETE BUTTON */}
                    <td>
                      <button
                        className="ta-delete-icon"
                        onClick={() =>
                          removeFromWatchlist(stock.symbol, stock.exchange)
                        }
                      >
                        <img
                          src={isDarkMode ? "/bin-dark.png" : "/bin-light.png"}
                          alt="Delete"
                          width={18}
                          height={18}
                        />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="ta-holdings-empty">
                    No stocks in watchlist yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
});
