import { memo, useState } from "react";
import {
  PortfolioOverview,
  type PortfolioHolding,
  type PortfolioMetrics,
} from "@/components/dashboard/portfolio-overview";
import { BuyPage } from "@/components/dashboard/buy-page";
import { SellPage } from "@/components/dashboard/sell-page";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import type { TradeDraft } from "@/components/dashboard/trade-modal";
import {
  TransactionHistoryTable,
  type TransactionRecord,
} from "@/components/dashboard/transaction-history-table";
import { MarketWatch } from "@/components/market-watch/market-watch";
import { ChartsPage } from "@/components/dashboard/charts-page";
import type { DashboardTab } from "@/components/dashboard/tabs";
import type { ApiWatchlistItem } from "@/lib/api";
import { TradeDrawer, type TradeDrawerStock } from "@/components/dashboard/trade-drawer";

type BuyNavigationTarget = {
  ticker: string;
  companyName: string;
  exchange?: string;
  currentPrice?: number;
};

type DashboardContentProps = {
  activeTab: DashboardTab;
  portfolioMetrics?: PortfolioMetrics;
  holdings?: PortfolioHolding[];
  isDarkMode: boolean;
  transactions: TransactionRecord[];
  watchlist: ApiWatchlistItem[];
  onTradeAction: (trade: TradeDraft) => void;
  onExecuteTrade: (trade: TradeDraft, shares: number) => Promise<void>;
  onAddWatchlist: (item: ApiWatchlistItem) => Promise<void>;
  onRemoveWatchlist: (item: ApiWatchlistItem) => Promise<void>;
  onPreviewNavigate: (tab: DashboardTab) => void;
  priceRefreshVersion: number;
  onOpenBuyStock: (stock: BuyNavigationTarget) => void;
  buyNavigationStock?: BuyNavigationTarget | null;
};

export const DashboardContent = memo(function DashboardContent({
  activeTab,
  portfolioMetrics,
  holdings,
  isDarkMode,
  transactions,
  watchlist,
  onTradeAction,
  onExecuteTrade,
  onAddWatchlist,
  onRemoveWatchlist,
  onPreviewNavigate,
  priceRefreshVersion,
  onOpenBuyStock,
  buyNavigationStock,
}: DashboardContentProps) {
  const [drawerStock, setDrawerStock] = useState<TradeDrawerStock | null>(null);

  function openDrawer(stock: TradeDrawerStock) {
    setDrawerStock(stock);
  }

  function closeDrawer() {
    setDrawerStock(null);
  }

  // Wrap onExecuteTrade to accept TradeDraft-like signature from the drawer
  async function handleDrawerTrade(
    trade: { ticker: string; company: string; exchange: string; price: number; type: "buy" | "sell"; maxShares?: number },
    shares: number
  ) {
    await onExecuteTrade(trade as TradeDraft, shares);
  }

  return (
    <>
      {/* Global Trade Drawer — rendered once, shared across all tabs */}
      <TradeDrawer
        stock={drawerStock}
        holdings={holdings}
        buyingPower={portfolioMetrics?.buyingPower}
        onClose={closeDrawer}
        onExecuteTrade={handleDrawerTrade}
      />

      {activeTab === "Dashboard" && (
        <DashboardHome
          holdings={holdings}
          transactions={transactions}
          watchlist={watchlist}
          isDarkMode={isDarkMode}
          onTradeAction={onTradeAction}
          onExecuteTrade={onExecuteTrade}
          onAddWatchlist={onAddWatchlist}
          onRemoveWatchlist={onRemoveWatchlist}
          onPreviewNavigate={onPreviewNavigate}
          onRowClick={openDrawer}
          priceRefreshVersion={priceRefreshVersion}
          buyingPower={portfolioMetrics?.buyingPower}
          onOpenBuyStock={onOpenBuyStock}
        />
      )}

      {activeTab === "Portfolio" && (
        <PortfolioOverview
          metrics={portfolioMetrics}
          holdings={holdings}
          onTradeAction={onTradeAction}
          onRowClick={openDrawer}
          onOpenBuyStock={onOpenBuyStock}
        />
      )}

      {activeTab === "Market Watch" && (
        <MarketWatch
          isDarkMode={isDarkMode}
          holdings={holdings}
          watchlist={watchlist}
          onTradeAction={onTradeAction}
          onAddWatchlist={onAddWatchlist}
          onRemoveWatchlist={onRemoveWatchlist}
          priceRefreshVersion={priceRefreshVersion}
          onRowClick={openDrawer}
          onOpenBuyStock={onOpenBuyStock}
        />
      )}

      {activeTab === "Buy" && (
        <BuyPage
          holdings={holdings}
          onTradeAction={onTradeAction}
          onExecuteTrade={onExecuteTrade}
          buyingPower={portfolioMetrics?.buyingPower}
          priceRefreshVersion={priceRefreshVersion}
          initialStock={buyNavigationStock}
        />
      )}

      {activeTab === "Sell" && (
        <SellPage
          holdings={holdings}
          onTradeAction={onTradeAction}
          onRowClick={openDrawer}
          onOpenBuyStock={onOpenBuyStock}
        />
      )}

      {activeTab === "Transaction History" && (
        <TransactionHistoryTable
          transactions={transactions}
          onRowClick={openDrawer}
          onOpenBuyStock={onOpenBuyStock}
        />
      )}

      {activeTab === "Analysis" && (
        <ChartsPage
          priceRefreshVersion={priceRefreshVersion}
          onOpenBuyStock={onOpenBuyStock}
        />
      )}
    </>
  );
});
