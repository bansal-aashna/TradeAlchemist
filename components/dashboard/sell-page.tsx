"use client";

import { memo } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";
import type { TradeDraft } from "@/components/dashboard/trade-modal";
import type { TradeDrawerStock } from "@/components/dashboard/trade-drawer";
import { useUsdEquivalents } from "@/lib/use-usd-display";

type SellPageProps = {
  holdings?: PortfolioHolding[];
  onTradeAction: (trade: TradeDraft) => void;
  onRowClick?: (stock: TradeDrawerStock) => void;
  onOpenBuyStock?: (stock: TradeDrawerStock) => void;
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

function getValueTone(value: number | undefined) {
  if (value === undefined || value === 0) {
    return "neutral";
  }
  return value > 0 ? "positive" : "negative";
}

export const SellPage = memo(function SellPage({
  holdings,
  onTradeAction,
  onRowClick,
  onOpenBuyStock,
}: SellPageProps) {
  const { showUsdEquivalents } = useUsdEquivalents();
  return (
    <section className="ta-dashboard-content ta-sell-page">
      <h2 className="ta-holdings-title">Sell</h2>

      <div className="ta-holdings-table-wrap">
        <table className="ta-holdings-table">
          <thead>
            <tr>
              <th>Stock</th>
              <th>Qty</th>
              <th className="ta-th-light">Current Price</th>
              <th className="ta-th-light">Hold Price</th>
              <th className="ta-th-light">Total P/L</th>
              <th className="ta-th-light">Trade</th>
            </tr>
          </thead>
          <tbody>
            {holdings && holdings.length > 0 ? (
              holdings.map((holding) => {
                const tone = getValueTone(holding.totalPL);
                const canSell = Boolean(holding.currentPrice) && Boolean(holding.quantity);

                return (
                  <tr
                    key={holding.ticker}
                    className="ta-clickable-row"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      onRowClick?.({
                        ticker: holding.ticker,
                        companyName: holding.companyName ?? holding.ticker,
                        exchange: holding.exchange ?? "",
                        currentPrice: holding.currentPriceNative ?? holding.currentPrice,
                        currentPriceUsd: holding.currentPrice,
                        currency: holding.currency,
                        initialTradeMode: "sell",
                      });
                    }}
                  >
                    <td>
                      <button
                        type="button"
                        className="ta-stock-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenBuyStock?.({
                            ticker: holding.ticker,
                            companyName: holding.companyName ?? holding.ticker,
                            exchange: holding.exchange ?? "",
                            currentPrice: holding.currentPriceNative ?? holding.currentPrice,
                            currentPriceUsd: holding.currentPrice,
                            currency: holding.currency,
                          });
                        }}
                      >
                        <p className="ta-holding-ticker">{holding.ticker}</p>
                      </button>
                      <p className="ta-holding-qty">Qty: {holding.quantity ?? "--"}</p>
                    </td>
                    <td>{holding.quantity ?? "--"}</td>
                    <td>
                      <div>{formatCurrency(holding.currentPrice)}</div>
                      {showUsdEquivalents && holding.currentPriceNative !== null && holding.currentPriceNative !== undefined ? (
                        <div className="ta-usd-equiv">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: holding.currency ?? "USD", maximumFractionDigits: 2 }).format(holding.currentPriceNative)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div>{formatCurrency(holding.holdPrice)}</div>
                      {showUsdEquivalents && holding.holdPriceNative !== null && holding.holdPriceNative !== undefined ? (
                        <div className="ta-usd-equiv">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: holding.currency ?? "USD", maximumFractionDigits: 2 }).format(holding.holdPriceNative)}
                        </div>
                      ) : null}
                    </td>
                    <td className={`ta-portfolio-value ${tone}`}>
                      {holding.totalPL === undefined ? "--" : formatCurrency(holding.totalPL)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ta-type-pill ta-type-pill-btn sell ta-sell-pill-btn"
                        disabled={!canSell}
                        onClick={() => {
                          if (!holding.currentPrice) {
                            return;
                          }
                          onTradeAction({
                            ticker: holding.ticker,
                            company: holding.companyName ?? holding.ticker,
                            exchange: holding.exchange,
                            price: holding.currentPrice,
                            type: "sell",
                            maxShares: holding.quantity,
                          });
                        }}
                      >
                        Sell
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="ta-holdings-empty">
                  No holdings available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});
