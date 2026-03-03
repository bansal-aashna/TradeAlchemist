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
    if (trade.type === "sell") {
      const availableShares =
        holdings.find((holding) => holding.ticker === trade.ticker)?.quantity ?? 0;

      if (availableShares <= 0) {
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
