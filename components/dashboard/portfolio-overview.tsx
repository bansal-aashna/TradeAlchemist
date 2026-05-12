"use client";

import { memo } from "react";
import { AllocationDonut } from "@/components/dashboard/allocation-donut";
import type { TradeDraft } from "@/components/dashboard/trade-modal";
import type { TradeDrawerStock } from "@/components/dashboard/trade-drawer";
import { useUsdEquivalents } from "@/lib/use-usd-display";
import type { ApiLimitOrder } from "@/lib/api";

export type PortfolioMetrics = {
  totalPortfolioValue?: number;
  investmentValue?: number;
  unrealisedPL?: number;
  todaysPL?: number;
  buyingPower?: number;
};

export type PortfolioHolding = {
  ticker: string;
  companyName?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  displayName?: string;
  quantity?: number;
  currentPrice?: number;
  currentPriceUsd?: number;
  holdPrice?: number;
  totalPL?: number;
  currency?: string;
  fxRateToUsd?: number;
  currentPriceNative?: number | null;
  holdPriceNative?: number | null;
};

type PortfolioOverviewProps = {
  metrics?: PortfolioMetrics;
  holdings?: PortfolioHolding[];
  onTradeAction: (trade: TradeDraft) => void;
  onRowClick?: (stock: TradeDrawerStock) => void;
  onOpenBuyStock?: (stock: TradeDrawerStock) => void;
  pendingLimitOrders?: ApiLimitOrder[];
};

const portfolioFields: Array<{ key: keyof PortfolioMetrics; label: string }> = [
  { key: "totalPortfolioValue", label: "Total Portfolio Value" },
  { key: "investmentValue", label: "Investment Value" },
  { key: "unrealisedPL", label: "Unrealised P/L" },
  { key: "todaysPL", label: "Today's P/L" },
  { key: "buyingPower", label: "Buying Power" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function getValueTone(value: number | undefined) {
  if (value === undefined) {
    return "neutral";
  }
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

export const PortfolioOverview = memo(function PortfolioOverview({
  metrics,
  holdings,
  onTradeAction,
  onRowClick,
  onOpenBuyStock,
  pendingLimitOrders = [],
}: PortfolioOverviewProps) {
  const { showUsdEquivalents } = useUsdEquivalents();
  return (
    <section className="ta-dashboard-content">
      <h2 className="ta-holdings-title">Portfolio</h2>

      <div className="ta-portfolio-grid">
        {portfolioFields.map((field) => {
          const value = metrics?.[field.key];
          const tone = getValueTone(value);
          const displayValue = value === undefined ? "--" : formatCurrency(value);

          return (
            <article key={field.key} className="ta-portfolio-card">
              <p className="ta-portfolio-label">{field.label}</p>
              <p className={`ta-portfolio-value ${tone}`}>{displayValue}</p>
            </article>
          );
        })}
      </div>

      <div className="ta-holdings-with-allocation">
        <div className="ta-holdings-wrap">
          <h3 className="ta-holdings-title">All Holdings</h3>
          <div className="ta-holdings-table-wrap">
            <table className="ta-holdings-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th className="ta-th-light">Current Price</th>
                  <th className="ta-th-light">Hold Price</th>
                  <th className="ta-th-light">Total P/L</th>
                  <th className="ta-th-light">Sell</th>
                </tr>
              </thead>
              <tbody>
                {holdings && holdings.length > 0 ? (
                  holdings.map((holding) => {
                    const plTone = getValueTone(holding.totalPL);
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
                        <td>
                          <div>{holding.currentPrice === undefined ? "--" : formatCurrency(holding.currentPrice)}</div>
                          {showUsdEquivalents && holding.currentPriceNative !== null && holding.currentPriceNative !== undefined ? (
                            <div className="ta-usd-equiv">
                              {new Intl.NumberFormat("en-US", { style: "currency", currency: holding.currency ?? "USD", maximumFractionDigits: 2 }).format(holding.currentPriceNative)}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div>{holding.holdPrice === undefined ? "--" : formatCurrency(holding.holdPrice)}</div>
                          {showUsdEquivalents && holding.holdPriceNative !== null && holding.holdPriceNative !== undefined ? (
                            <div className="ta-usd-equiv">
                              {new Intl.NumberFormat("en-US", { style: "currency", currency: holding.currency ?? "USD", maximumFractionDigits: 2 }).format(holding.holdPriceNative)}
                            </div>
                          ) : null}
                        </td>
                        <td className={`ta-portfolio-value ${plTone}`}>
                          {holding.totalPL === undefined ? "--" : formatCurrency(holding.totalPL)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ta-type-pill ta-type-pill-btn sell ta-sell-pill-btn"
                            disabled={!holding.currentPrice || !holding.quantity}
                            onClick={() => {
                              if (!holding.currentPrice || !holding.quantity) {
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
                    <td colSpan={5} className="ta-holdings-empty">
                      Holdings will appear once trading data is connected. When backend is ready, pass a real holdings array and values will render automatically.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="ta-allocation-wrap" style={{ marginTop: "0.8rem" }}>
          <h3 className="ta-holdings-title">Asset Allocation</h3>
          <AllocationDonut holdings={holdings} />
        </div>
      </div>

      <div className="ta-pending-orders-section" style={{ marginTop: "4rem" }}>
        <h3 className="ta-holdings-title">Pending Orders</h3>
        <div className="ta-holdings-table-wrap">
          <table className="ta-holdings-table">
            <thead>
              <tr>
                <th>Stock</th>
                <th className="ta-th-light">Type</th>
                <th className="ta-th-light">Limit Price</th>
                <th className="ta-th-light">Current Price</th>
                <th className="ta-th-light">Quantity</th>
                <th className="ta-th-light">Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingLimitOrders.length > 0 ? (
                pendingLimitOrders.map((order) => (
                  <tr key={order.id} className="ta-clickable-row" onClick={() => onRowClick?.({
                    ticker: order.ticker,
                    companyName: order.companyName,
                    exchange: order.exchange,
                    currentPrice: order.limitPrice,
                    currency: order.currency,
                  })}>
                    <td>
                      <p className="ta-holding-ticker">{order.ticker}</p>
                      <p className="ta-holding-qty">{order.companyName}</p>
                    </td>
                    <td>
                      <span className={`ta-type-pill ${order.side}`}>
                        {order.side.toUpperCase()}
                      </span>
                    </td>
                    <td>{formatCurrency(order.limitPrice)}</td>
                    <td>{order.currentPrice ? formatCurrency(order.currentPrice) : "--"}</td>
                    <td>{order.quantity}</td>
                    <td>
                      <span className={`ta-status-pill ${order.status}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="ta-holdings-empty">
                    No pending limit orders.
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
