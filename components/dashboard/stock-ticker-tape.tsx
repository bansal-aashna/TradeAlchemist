"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";
import { getLivePrices, type ApiStock, type ApiWatchlistItem } from "@/lib/api";

type StockTickerTapeProps = {
  priceRefreshVersion: number;
  holdings?: PortfolioHolding[];
  watchlist?: ApiWatchlistItem[];
};

type TickerItem = {
  symbol: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  percentChange: number;
};

const FALLBACK_CURRENCY = "USD";
const MAX_TICKER_ITEMS = 20;

function asFiniteNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toTickerItem(stock: ApiStock): TickerItem | null {
  const price = asFiniteNumber(stock.currentPrice);
  if (price === undefined) {
    return null;
  }

  const change =
    asFiniteNumber(stock.change) ??
    (stock.prevClose && stock.prevClose > 0 ? price - stock.prevClose : 0);
  const percentChange =
    asFiniteNumber(stock.percentChange) ??
    (stock.prevClose && stock.prevClose > 0 ? (change / stock.prevClose) * 100 : 0);

  return {
    symbol: stock.symbol,
    exchange: stock.exchange,
    currency: stock.currency ?? FALLBACK_CURRENCY,
    price,
    change,
    percentChange,
  };
}

function toTickerItemFromWatchlist(stock: ApiWatchlistItem): TickerItem | null {
  const price = asFiniteNumber(stock.currentPrice);
  if (price === undefined) {
    return null;
  }

  const change =
    asFiniteNumber(stock.change) ??
    (stock.prevClose && stock.prevClose > 0 ? price - stock.prevClose : 0);
  const percentChange =
    asFiniteNumber(stock.percentChange) ??
    (stock.prevClose && stock.prevClose > 0 ? (change / stock.prevClose) * 100 : 0);

  return {
    symbol: stock.ticker,
    exchange: stock.exchange,
    currency: stock.currency ?? FALLBACK_CURRENCY,
    price,
    change,
    percentChange,
  };
}

function toTickerItemFromHolding(holding: PortfolioHolding): TickerItem | null {
  const price = asFiniteNumber(holding.currentPriceNative ?? undefined) ?? asFiniteNumber(holding.currentPrice);
  if (price === undefined) {
    return null;
  }

  const basis = asFiniteNumber(holding.holdPriceNative ?? undefined) ?? asFiniteNumber(holding.holdPrice);
  const change = basis && basis > 0 ? price - basis : asFiniteNumber(holding.totalPL) ?? 0;
  const percentChange = basis && basis > 0 ? (change / basis) * 100 : 0;

  return {
    symbol: holding.ticker,
    exchange: holding.exchange ?? "",
    currency: holding.currency ?? FALLBACK_CURRENCY,
    price,
    change,
    percentChange,
  };
}

function uniqueTickerItems(items: TickerItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.symbol}:${item.exchange}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 1000 ? 2 : 3,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 3 })}`;
  }
}

export const StockTickerTape = memo(function StockTickerTape({
  priceRefreshVersion,
  holdings = [],
  watchlist = [],
}: StockTickerTapeProps) {
  const seedItems = useMemo(
    () =>
      uniqueTickerItems([
        ...watchlist
          .map(toTickerItemFromWatchlist)
          .filter((item): item is TickerItem => item !== null),
        ...holdings
          .map(toTickerItemFromHolding)
          .filter((item): item is TickerItem => item !== null),
      ])
        .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
        .slice(0, MAX_TICKER_ITEMS),
    [holdings, watchlist],
  );
  const [items, setItems] = useState<TickerItem[]>(seedItems);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (seedItems.length > 0) {
      setItems(seedItems);
      setIsLoading(false);
    }
  }, [seedItems]);

  useEffect(() => {
    let isMounted = true;

    async function loadLivePrices() {
      try {
        const stocks = await getLivePrices();
        if (!isMounted) {
          return;
        }

        const liveItems = stocks
          .map(toTickerItem)
          .filter((item): item is TickerItem => item !== null)
          // Sort by absolute percentage change (most volatile/changed)
          .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
          .slice(0, 20);

        if (liveItems.length > 0) {
          setItems(liveItems);
        } else if (seedItems.length > 0) {
          // If live prices fail but we have watchlist/holdings, show top 20 of those
          const sortedSeed = [...seedItems]
            .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
            .slice(0, 20);
          setItems(sortedSeed);
        }
      } catch {
        if (isMounted) {
          setItems(seedItems);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadLivePrices();

    return () => {
      isMounted = false;
    };
  }, [priceRefreshVersion, seedItems]);

  const marqueeItems = useMemo(() => {
    if (items.length === 0) {
      return [];
    }
    return [...items, ...items];
  }, [items]);

  if (isLoading && items.length === 0) {
    return (
      <section className="ta-ticker-tape" aria-label="Live stock ticker">
        <div className="ta-ticker-track static">
          <span className="ta-ticker-empty">Loading live prices...</span>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="ta-ticker-tape" aria-label="Live stock ticker">
        <div className="ta-ticker-track static">
          <span className="ta-ticker-empty">Live prices unavailable</span>
        </div>
      </section>
    );
  }

  return (
    <section className="ta-ticker-tape" aria-label="Live stock ticker">
      <div className="ta-ticker-track">
        {marqueeItems.map((item, index) => {
          const directionClass = item.percentChange >= 0 ? "positive" : "negative";
          const arrow = item.percentChange >= 0 ? "▲" : "▼";
          return (
            <div className="ta-ticker-item" key={`${item.symbol}-${item.exchange}-${index}`}>
              <span className="ta-ticker-symbol">{item.symbol}</span>
              <span className="ta-ticker-price">{formatPrice(item.price, item.currency)}</span>
              <span className={`ta-ticker-change ${directionClass}`}>
                <span aria-hidden="true" className="ta-ticker-arrow">
                  {arrow}
                </span>
                <span>{Math.abs(item.percentChange).toFixed(2)}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
});
