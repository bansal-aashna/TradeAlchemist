"use client";

import { memo, useState, useEffect } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";

export type TradeDrawerStock = {
  ticker: string;
  companyName: string;
  exchange: string;
  currentPrice?: number;
  initialTradeMode?: "buy" | "sell";
};

type TradeDrawerProps = {
  stock: TradeDrawerStock | null;
  holdings?: PortfolioHolding[];
  buyingPower?: number;
  onClose: () => void;
  onExecuteTrade?: (
    trade: { ticker: string; company: string; exchange: string; price: number; type: "buy" | "sell"; maxShares?: number },
    shares: number
  ) => Promise<void>;
};

function formatCurrency(value: number | undefined) {
  if (value === undefined) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export const TradeDrawer = memo(function TradeDrawer({
  stock,
  holdings,
  buyingPower,
  onClose,
  onExecuteTrade,
}: TradeDrawerProps) {
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("0");
  const [isTrading, setIsTrading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (stock) {
      setShares("0");
      setMessage(null);
      setTradeMode(stock.initialTradeMode ?? "buy");
      // Small delay so CSS transition fires
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [stock]);

  const ownedShares = holdings?.find((h) => h.ticker === stock?.ticker)?.quantity ?? 0;
  const estimatedCost = (Number(shares) || 0) * (stock?.currentPrice ?? 0);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300); // wait for slide-out animation
  }

  async function handleTrade() {
    if (!stock?.currentPrice || !onExecuteTrade) return;
    const qty = Number(shares);
    if (isNaN(qty) || qty <= 0) {
      setMessage("Enter a valid number of shares.");
      return;
    }
    if (tradeMode === "sell" && qty > ownedShares) {
      setMessage(`You only own ${ownedShares} shares.`);
      return;
    }
    setIsTrading(true);
    setMessage(null);
    try {
      await onExecuteTrade(
        {
          ticker: stock.ticker,
          company: stock.companyName,
          exchange: stock.exchange,
          price: stock.currentPrice,
          type: tradeMode,
          maxShares: tradeMode === "sell" ? ownedShares : undefined,
        },
        qty
      );
      setMessage(`${tradeMode === "buy" ? "Bought" : "Sold"} ${qty} share(s) of ${stock.ticker} ✓`);
      setShares("0");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Trade failed.");
    } finally {
      setIsTrading(false);
    }
  }

  if (!stock) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="ta-drawer-backdrop"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className="ta-trade-drawer"
        style={{ transform: visible ? "translateY(0)" : "translateY(100%)" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Trade ${stock.ticker}`}
      >
        {/* Handle / close */}
        <div className="ta-drawer-header">
          <div className="ta-drawer-handle" />
          <button type="button" className="ta-drawer-close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Stock info row */}
        <div className="ta-drawer-stock-row">
          <div>
            <p className="ta-buy-selected-symbol">{stock.ticker}</p>
            <p className="ta-buy-selected-company">{stock.companyName}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="ta-buy-selected-price">{formatCurrency(stock.currentPrice)}</p>
            <p className="ta-drawer-exchange">{stock.exchange}</p>
          </div>
        </div>

        {/* Buy / Sell toggle */}
        <div className="ta-trade-seg-wrap" style={{ marginTop: "1.25rem" }}>
          <button
            type="button"
            className={`ta-trade-seg-btn buy ${tradeMode === "buy" ? "active" : ""}`}
            onClick={() => { setTradeMode("buy"); setMessage(null); }}
          >
            Buy
          </button>
          <button
            type="button"
            className={`ta-trade-seg-btn sell ${tradeMode === "sell" ? "active" : ""}`}
            onClick={() => { setTradeMode("sell"); setMessage(null); }}
          >
            Sell
          </button>
        </div>

        {/* Shares input */}
        <div className="ta-trade-field" style={{ marginTop: "1rem" }}>
          <label className="ta-trade-field-label">Shares</label>
          <div className="ta-trade-shares-row">
            <input
              type="number"
              min="0"
              className="ta-trade-shares-input"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
            />
            <button
              type="button"
              className="ta-trade-max-btn"
              onClick={() => {
                if (tradeMode === "sell") {
                  setShares(String(ownedShares));
                } else if (stock.currentPrice && stock.currentPrice > 0) {
                  setShares(String(Math.floor((buyingPower ?? 0) / stock.currentPrice)));
                }
              }}
            >
              Max
            </button>
          </div>
        </div>

        {/* Info rows */}
        <div className="ta-trade-info" style={{ marginTop: "1rem" }}>
          <div className="ta-trade-info-row">
            <span>Estimated {tradeMode === "buy" ? "Cost" : "Proceeds"}:</span>
            <span>{formatCurrency(estimatedCost)}</span>
          </div>
          <div className="ta-trade-info-row">
            <span>Buying Power:</span>
            <span>{formatCurrency(buyingPower)}</span>
          </div>
          {tradeMode === "sell" && (
            <div className="ta-trade-info-row">
              <span>Shares Owned:</span>
              <span>{ownedShares}</span>
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <p className={`ta-drawer-msg ${message.includes("✓") ? "success" : "error"}`}>
            {message}
          </p>
        )}

        {/* CTA */}
        <button
          type="button"
          className={`ta-trade-cta-btn ${tradeMode}`}
          style={{ marginTop: "1.25rem", width: "100%" }}
          disabled={
            isTrading ||
            !stock.currentPrice ||
            Number(shares) <= 0 ||
            (tradeMode === "sell" && ownedShares <= 0)
          }
          onClick={handleTrade}
        >
          {isTrading ? "Processing..." : tradeMode === "buy" ? "Place Buy Order" : "Place Sell Order"}
        </button>
      </aside>
    </>
  );
});
