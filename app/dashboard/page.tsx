"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import {
  type PortfolioHolding,
  type PortfolioMetrics,
} from "@/components/dashboard/portfolio-overview";
import { TradeModal, type TradeDraft } from "@/components/dashboard/trade-modal";
import type { TransactionRecord } from "@/components/dashboard/transaction-history-table";
import { holdingsSample } from "@/lib/sample-data/holdings";
import { transactionHistorySample } from "@/lib/sample-data/transaction-history";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { type DashboardTab } from "@/components/dashboard/tabs";
import { auth } from "@/lib/firebase";



export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>("Dashboard");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [transactions, setTransactions] = useState<TransactionRecord[]>(transactionHistorySample);
  const [activeTrade, setActiveTrade] = useState<TradeDraft | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const portfolioMetrics: PortfolioMetrics | undefined = undefined;
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(holdingsSample);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    router.push("/");
  }, [router]);

  const handleThemeToggle = useCallback(() => {
    setIsDarkMode((current) => !current);
  }, []);

  const handleTabChange = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
  }, []);

  const handleTradeAction = useCallback((trade: TradeDraft) => {
    setTradeMessage(null);
    if (trade.type === "sell") {
      const availableShares =
        holdings.find((holding) => holding.ticker === trade.ticker)?.quantity ?? 0;

      if (availableShares <= 0) {
        setTradeMessage(`Cannot sell ${trade.ticker}: no shares available in holdings.`);
        return;
      }

      setActiveTrade({
        ...trade,
        maxShares: availableShares,
      });
      return;
    }

    setActiveTrade(trade);
  }, [holdings]);

  const handleTradeConfirm = useCallback(
    (shares: number) => {
      if (!activeTrade) {
        return;
      }

      if (activeTrade.type === "sell") {
        const availableShares =
          holdings.find((holding) => holding.ticker === activeTrade.ticker)?.quantity ?? 0;

        if (shares > availableShares) {
          setTradeMessage(`Cannot sell ${shares} shares of ${activeTrade.ticker}.`);
          return;
        }
      }

      const newTransaction: TransactionRecord = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}`,
        dateTime: new Date().toISOString(),
        ticker: activeTrade.ticker,
        company: activeTrade.company,
        type: activeTrade.type,
        shares,
        price: activeTrade.price,
      };

      setTransactions((previous) => [newTransaction, ...previous]);

      if (activeTrade.type === "buy") {
        setHoldings((previous) => {
          const existing = previous.find(
            (holding) => holding.ticker === activeTrade.ticker,
          );
          if (!existing) {
            return [
              {
                ticker: activeTrade.ticker,
                quantity: shares,
                holdPrice: activeTrade.price,
                currentPrice: activeTrade.price,
                totalPL: 0,
              },
              ...previous,
            ];
          }

          const currentQty = existing.quantity ?? 0;
          const currentHoldPrice = existing.holdPrice ?? activeTrade.price;
          const nextQty = currentQty + shares;
          const avgHoldPrice =
            nextQty > 0
              ? (currentQty * currentHoldPrice + shares * activeTrade.price) / nextQty
              : activeTrade.price;
          const nextCurrentPrice = activeTrade.price;
          const nextTotalPL = (nextCurrentPrice - avgHoldPrice) * nextQty;

          return previous.map((holding) =>
            holding.ticker === activeTrade.ticker
              ? {
                  ...holding,
                  quantity: nextQty,
                  holdPrice: Number(avgHoldPrice.toFixed(2)),
                  currentPrice: nextCurrentPrice,
                  totalPL: Number(nextTotalPL.toFixed(2)),
                }
              : holding,
          );
        });
      }

      if (activeTrade.type === "sell") {
        setHoldings((previous) =>
          previous
            .map((holding) => {
              if (holding.ticker !== activeTrade.ticker) {
                return holding;
              }
              const currentQty = holding.quantity ?? 0;
              const nextQty = Math.max(0, currentQty - shares);
              return { ...holding, quantity: nextQty };
            })
            .filter((holding) => (holding.quantity ?? 0) > 0),
        );
      }

      setTradeMessage(null);
      setActiveTrade(null);
    },
    [activeTrade, holdings],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  return (
    <main className={`ta-dashboard ${isDarkMode ? "dark" : "light"}`}>
      <DashboardTopbar
        activeTab={activeTab}
        isDarkMode={isDarkMode}
        onTabChange={handleTabChange}
        onThemeToggle={handleThemeToggle}
        onLogout={handleLogout}
      />
      <DashboardContent
        activeTab={activeTab}
        portfolioMetrics={portfolioMetrics}
        holdings={holdings}
        isDarkMode={isDarkMode}
        transactions={transactions}
        onTradeAction={handleTradeAction}
      />
      {tradeMessage ? <p className="ta-global-message">{tradeMessage}</p> : null}
      {activeTrade ? (
        <TradeModal
          trade={activeTrade}
          onCancel={() => setActiveTrade(null)}
          onConfirm={handleTradeConfirm}
        />
      ) : null}
    </main>
  );
}
