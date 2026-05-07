import { memo, useMemo } from "react";
import type { ApiStock } from "@/lib/api";

type StockTickerTapeProps = {
  stocks: ApiStock[];
};

function formatPrice(value?: number) {
  if (value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatPercent(value?: number) {
  if (value === undefined) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export const StockTickerTape = memo(function StockTickerTape({ stocks }: StockTickerTapeProps) {
  const items = useMemo(() => {
    const seen = new Set<string>();
    const filtered = stocks
      .filter((stock) => {
        const key = `${stock.exchange ?? ""}::${stock.symbol}`;
        if (!stock.symbol || stock.currentPrice === undefined || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 60);

    return filtered.length > 0 ? [...filtered, ...filtered] : [];
  }, [stocks]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="ta-ticker-tape" aria-label="Live stock ticker">
      <div className="ta-ticker-tape-mask">
        <div className="ta-ticker-tape-track">
          {items.map((stock, index) => {
            const isPositive = (stock.percentChange ?? stock.change ?? 0) >= 0;
            return (
              <article
                key={`${stock.symbol}-${stock.exchange}-${index}`}
                className="ta-ticker-tape-item"
              >
                <span className="ta-ticker-tape-symbol">{stock.symbol}</span>
                <span className="ta-ticker-tape-price">{formatPrice(stock.currentPrice)}</span>
                <span className={`ta-ticker-tape-change ${isPositive ? "positive" : "negative"}`}>
                  <span className="ta-ticker-tape-arrow" aria-hidden="true">
                    {isPositive ? "▲" : "▼"}
                  </span>
                  {formatPercent(stock.percentChange)}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
});
