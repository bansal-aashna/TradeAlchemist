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
import type { ApiLimitOrder, ApiWatchlistItem, PlaceLimitOrderRequest } from "@/lib/api";
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
  onExecuteTrade: (trade: TradeDraft, shares: number) => Promise<void>;
  onAddWatchlist: (item: ApiWatchlistItem) => Promise<void>;
  onRemoveWatchlist: (item: ApiWatchlistItem) => Promise<void>;
  pendingLimitOrders: ApiLimitOrder[];
  onPlaceLimitOrder: (request: PlaceLimitOrderRequest) => Promise<void>;
  onPreviewNavigate: (tab: DashboardTab) => void;
  priceRefreshVersion: number;
  onOpenBuyStock: (stock: BuyNavigationTarget) => void;
  buyNavigationStock?: BuyNavigationTarget | null;
  customWatchlists: Record<string, string[]>;
  onSetCustomWatchlists: (val: Record<string, string[]>) => void;
};

export const DashboardContent = memo(function DashboardContent({
  activeTab,
  portfolioMetrics,
  holdings,
  isDarkMode,
  transactions,
  watchlist,
  onExecuteTrade,
  onAddWatchlist,
  onRemoveWatchlist,
  pendingLimitOrders,
  onPlaceLimitOrder,
  onPreviewNavigate,
  priceRefreshVersion,
  onOpenBuyStock,
  buyNavigationStock,
  customWatchlists,
  onSetCustomWatchlists,
}: DashboardContentProps) {
  const [drawerStock, setDrawerStock] = useState<TradeDrawerStock | null>(null);

  function openDrawer(stock: TradeDrawerStock) {
    setDrawerStock(stock);
  }

  function closeDrawer() {
    setDrawerStock(null);
  }

  function handleTradeAction(trade: TradeDraft) {
    openDrawer({
      ticker: trade.ticker,
      companyName: trade.company ?? trade.ticker,
      exchange: trade.exchange ?? "",
      currentPrice: trade.price,
      initialTradeMode: trade.type,
    });
  }

  // Wrap onExecuteTrade to accept TradeDraft-like signature from the drawer
  async function handleDrawerTrade(
    trade: {
      ticker: string;
      company: string;
      exchange: string;
      price: number;
      type: "buy" | "sell";
      maxShares?: number;
    },
    shares: number,
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
        onPlaceLimitOrder={onPlaceLimitOrder}
      />

      {activeTab === "Dashboard" && (
        <DashboardHome
          holdings={holdings}
          transactions={transactions}
          watchlist={watchlist}
          isDarkMode={isDarkMode}
          onTradeAction={handleTradeAction}
          onExecuteTrade={onExecuteTrade}
          onAddWatchlist={onAddWatchlist}
          onRemoveWatchlist={onRemoveWatchlist}
          pendingLimitOrders={pendingLimitOrders}
          onPlaceLimitOrder={onPlaceLimitOrder}
          onPreviewNavigate={onPreviewNavigate}
          onRowClick={openDrawer}
          priceRefreshVersion={priceRefreshVersion}
          buyingPower={portfolioMetrics?.buyingPower}
          onOpenBuyStock={onOpenBuyStock}
          customWatchlists={customWatchlists}
        />
      )}

      {activeTab === "Portfolio" && (
        <PortfolioOverview
          metrics={portfolioMetrics}
          holdings={holdings}
          onTradeAction={handleTradeAction}
          onRowClick={openDrawer}
          onOpenBuyStock={onOpenBuyStock}
          pendingLimitOrders={pendingLimitOrders}
        />
      )}

      {activeTab === "Market Watch" && (
        <MarketWatch
          isDarkMode={isDarkMode}
          holdings={holdings}
          watchlist={watchlist}
          onTradeAction={handleTradeAction}
          onAddWatchlist={onAddWatchlist}
          onRemoveWatchlist={onRemoveWatchlist}
          priceRefreshVersion={priceRefreshVersion}
          onRowClick={openDrawer}
          onOpenBuyStock={onOpenBuyStock}
          customWatchlists={customWatchlists}
          onSetCustomWatchlists={onSetCustomWatchlists}
        />
      )}

      {activeTab === "Buy" && (
        <BuyPage
          holdings={holdings}
          onTradeAction={handleTradeAction}
          onExecuteTrade={onExecuteTrade}
          buyingPower={portfolioMetrics?.buyingPower}
          priceRefreshVersion={priceRefreshVersion}
          initialStock={buyNavigationStock}
          onPlaceLimitOrder={onPlaceLimitOrder}
        />
      )}

      {activeTab === "Sell" && (
        <SellPage
          holdings={holdings}
          onTradeAction={handleTradeAction}
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
          holdings={holdings}
          watchlist={watchlist}
        />
      )}
    </>
  );
});
