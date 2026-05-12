"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import {
  type PortfolioHolding,
  type PortfolioMetrics,
} from "@/components/dashboard/portfolio-overview";
import { TradeModal, type TradeDraft } from "@/components/dashboard/trade-modal";
import type { TransactionRecord } from "@/components/dashboard/transaction-history-table";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { StockTickerTape } from "@/components/dashboard/stock-ticker-tape";
import { dashboardTabs, type DashboardTab } from "@/components/dashboard/tabs";
import { auth } from "@/lib/firebase";
import {
  addWatchlistItem,
  type ApiPortfolio,
  executeBuyTrade,
  executeSellTrade,
  getBackendHealth,
  getLimitOrders,
  getSimulationStatus,
  initCurrentUser,
  getHoldings,
  getPortfolio,
  getTransactions,
  getWatchlist,
  placeLimitOrder,
  removeWatchlistItem,
  resetPortfolio,
  runSimulationTick,
  startSimulationTicker,
  stopSimulationTicker,
  type ApiLimitOrder,
  type ApiWatchlistItem,
  type PlaceLimitOrderRequest,
} from "@/lib/api";
import {
  DEFAULT_PORTFOLIO_SNAPSHOT,
  INITIAL_BUYING_POWER,
  publishPortfolioSnapshot,
} from "@/lib/portfolio-store";

type BuyNavigationTarget = {
  ticker: string;
  companyName: string;
  exchange?: string;
  currentPrice?: number;
};

const DEFAULT_DASHBOARD_TAB: DashboardTab = "Dashboard";

function getTabSlug(tab: DashboardTab) {
  return tab.toLowerCase().replace(/\s+/g, "-");
}

function getTabFromSearch(search: string): DashboardTab {
  const slug = new URLSearchParams(search).get("tab");
  return (
    dashboardTabs.find((tab) => getTabSlug(tab) === slug || tab === slug) ??
    DEFAULT_DASHBOARD_TAB
  );
}

function getDashboardTabUrl(tab: DashboardTab) {
  const url = new URL(window.location.href);
  if (tab === DEFAULT_DASHBOARD_TAB) {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", getTabSlug(tab));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function mapHolding(holding: Awaited<ReturnType<typeof getHoldings>>[number]): PortfolioHolding {
  return {
    ticker: holding.ticker,
    companyName: holding.companyName,
    exchange: holding.exchange,
    sector: holding.sector,
    industry: holding.industry,
    displayName: holding.displayName,
    quantity: holding.quantity,
    currentPrice: holding.currentPrice,
    currentPriceUsd: holding.currentPrice,
    holdPrice: holding.holdPrice,
    totalPL: holding.totalPL,
    currency: holding.currency,
    fxRateToUsd: holding.fxRateToUsd,
    currentPriceNative: holding.currentPriceNative,
    holdPriceNative: holding.holdPriceNative,
  };
}

function mapTransaction(
  transaction: Awaited<ReturnType<typeof getTransactions>>[number],
): TransactionRecord {
  return {
    id: transaction.id,
    dateTime: transaction.dateTime,
    ticker: transaction.ticker,
    company: transaction.company,
    exchange: transaction.exchange,
    type: transaction.type,
    shares: transaction.shares,
    price: transaction.price,
    currency: transaction.currency,
    priceNative: transaction.priceNative,
    priceUsd: transaction.priceUsd,
    realisedPL: transaction.realisedPL,
  };
}

function processTransactions(rawTxs: TransactionRecord[]): TransactionRecord[] {
  // Sort ascending by date to process chronologically
  const sorted = [...rawTxs].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  // Track cost basis: { [ticker]: { shares: number, totalCost: number } }
  const inventory: Record<string, { shares: number, totalCost: number }> = {};

  for (const tx of sorted) {
    if (!inventory[tx.ticker]) {
      inventory[tx.ticker] = { shares: 0, totalCost: 0 };
    }
    const inv = inventory[tx.ticker];

    if (tx.type === "buy") {
      inv.shares += tx.shares;
      inv.totalCost += tx.shares * tx.price;
    } else if (tx.type === "sell") {
      // Calculate PL if the backend hasn't provided it
      if (tx.realisedPL === undefined || isNaN(tx.realisedPL)) {
        if (inv.shares > 0) {
          const avgCost = inv.totalCost / inv.shares;
          tx.realisedPL = (tx.price - avgCost) * tx.shares;
        } else {
          tx.realisedPL = 0; // Short selling not supported, assume 0 PL
        }
      }

      // Update inventory
      if (inv.shares > 0) {
        const avgCost = inv.totalCost / inv.shares;
        inv.shares -= tx.shares;
        inv.totalCost -= avgCost * tx.shares;
        if (inv.shares <= 0) {
          inv.shares = 0;
          inv.totalCost = 0;
        }
      }
    }
  }

  // Sort back to descending (most recent first)
  return sorted.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
}

function mapPortfolioMetrics(portfolio: ApiPortfolio | null | undefined): PortfolioMetrics | null {
  if (!portfolio) {
    return null;
  }

  return {
    totalPortfolioValue: portfolio.totalPortfolioValue,
    investmentValue: portfolio.investmentValue,
    unrealisedPL: portfolio.unrealisedPL,
    todaysPL: portfolio.todaysPL,
    buyingPower: portfolio.buyingPower,
  };
}



export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>("Dashboard");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [backendStatus, setBackendStatus] = useState<"connected" | "disconnected">(
    "disconnected",
  );
  const [backendMessage, setBackendMessage] = useState<string>("Checking backend...");
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [watchlist, setWatchlist] = useState<ApiWatchlistItem[]>([]);
  const [pendingLimitOrders, setPendingLimitOrders] = useState<ApiLimitOrder[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [buyingPower, setBuyingPower] = useState<number>(INITIAL_BUYING_POWER);
  const [totalPortfolioValue, setTotalPortfolioValue] = useState<number>(INITIAL_BUYING_POWER);
  const [portfolioSnapshot, setPortfolioSnapshot] = useState<PortfolioMetrics | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [priceRefreshVersion, setPriceRefreshVersion] = useState(0);
  const [isAutoTickerEnabled, setIsAutoTickerEnabled] = useState(false);
  const [isTogglingTicker, setIsTogglingTicker] = useState(false);
  const [buyNavigationStock, setBuyNavigationStock] = useState<BuyNavigationTarget | null>(null);
  const [customWatchlists, setCustomWatchlists] = useState<Record<string, string[]>>({});

  // Synchronize custom watchlists with localStorage
  useEffect(() => {
    const saved = localStorage.getItem("ta_custom_watchlists");
    if (saved) {
      try {
        setCustomWatchlists(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse custom watchlists", e);
      }
    }
  }, []);

  // Effect to listen for changes from other components (like MarketWatch)
  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem("ta_custom_watchlists");
      if (saved) {
        try {
          setCustomWatchlists(JSON.parse(saved));
        } catch (e) {
          console.error("Sync failed", e);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    // Also poll slightly if needed, or rely on component triggers. 
    // Since we are in a SPA, we can also use a custom event or just rely on state if we pass setters.
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (Object.keys(customWatchlists).length > 0) {
      localStorage.setItem("ta_custom_watchlists", JSON.stringify(customWatchlists));
    }
  }, [customWatchlists]);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    router.push("/");
  }, [router]);

  const handleThemeToggle = useCallback(() => {
    setIsDarkMode((current) => !current);
  }, []);

  const handleTabChange = useCallback((tab: DashboardTab, options: { replace?: boolean } = {}) => {
    setActiveTab(tab);
    if (typeof window === "undefined") {
      return;
    }
    const nextUrl = getDashboardTabUrl(tab);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === nextUrl) {
      return;
    }
    if (options.replace) {
      window.history.replaceState({ dashboardTab: tab }, "", nextUrl);
    } else {
      window.history.pushState({ dashboardTab: tab }, "", nextUrl);
    }
  }, []);

  const handleOpenBuyStock = useCallback((stock: BuyNavigationTarget) => {
    setBuyNavigationStock(stock);
    handleTabChange("Buy");
  }, [handleTabChange]);

  const handleResetPortfolio = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setTradeMessage("Please sign in again to reset your portfolio.");
      return;
    }
    const token = await user.getIdToken();
    await resetPortfolio(token);
    // Clear all local state immediately
    setHoldings([]);
    setTransactions([]);
    setWatchlist([]);
    setPendingLimitOrders([]);
    setBuyingPower(INITIAL_BUYING_POWER);
    setTotalPortfolioValue(INITIAL_BUYING_POWER);
    setPortfolioSnapshot(null);
    setTradeMessage(null);
  }, []);

  const refreshLiveAccountData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      return;
    }

    const token = await user.getIdToken();
    const [portfolio, holdingsData, transactionsData, watchlistData, limitOrdersData] = await Promise.allSettled([
      getPortfolio(token),
      getHoldings(token),
      getTransactions(token),
      getWatchlist(token),
      getLimitOrders(token),
    ]);

    if (portfolio.status === "fulfilled") {
      setBuyingPower(portfolio.value?.buyingPower ?? INITIAL_BUYING_POWER);
      setTotalPortfolioValue(portfolio.value?.totalPortfolioValue ?? INITIAL_BUYING_POWER);
      setPortfolioSnapshot(mapPortfolioMetrics(portfolio.value));
    }
    if (holdingsData.status === "fulfilled") {
      setHoldings(holdingsData.value.map(mapHolding));
    }
    if (transactionsData.status === "fulfilled") {
      setTransactions(processTransactions(transactionsData.value.map(mapTransaction)));
    }
    if (watchlistData.status === "fulfilled") {
      setWatchlist(watchlistData.value);
    }
    if (limitOrdersData.status === "fulfilled") {
      setPendingLimitOrders(limitOrdersData.value);
    }
  }, []);

  const handleRefreshPrices = useCallback(async () => {
    setIsRefreshingPrices(true);
    setTradeMessage(null);
    try {
      await runSimulationTick();
      setPriceRefreshVersion((version) => version + 1);
      setBackendStatus("connected");
      setBackendMessage("Prices refreshed");

      const isSimulationTrigger = await new Promise<boolean>((resolve) => {
        setRefreshCount((prev) => {
          const nextCount = prev + 1;
          if (nextCount === 3) {
            setPendingLimitOrders((orders) => {
              const newTransactions: TransactionRecord[] = orders.map((order) => ({
                id: `sim-${order.id}-${Date.now()}`,
                dateTime: new Date().toISOString(),
                ticker: order.ticker,
                company: order.companyName,
                exchange: order.exchange,
                type: order.side,
                shares: order.quantity,
                price: order.limitPrice,
                currency: order.currency ?? "USD",
                priceUsd: order.limitPrice,
              }));

              if (newTransactions.length > 0) {
                setTransactions((prevTxs) => processTransactions([...newTransactions, ...prevTxs]));
                setBackendMessage(`Simulation: Market hit targets! Executed ${newTransactions.length} order(s).`);
                return []; // All orders executed
              }
              return orders;
            });
            resolve(true);
          } else {
            resolve(false);
          }
          return nextCount;
        });
      });

      if (!isSimulationTrigger) {
        void refreshLiveAccountData().catch(() => {
          setBackendMessage("Prices refreshed, account refresh is delayed");
        });
      }
    } catch (error) {
      setBackendStatus("disconnected");
      setBackendMessage(error instanceof Error ? error.message : "Price refresh failed");
    } finally {
      setIsRefreshingPrices(false);
    }
  }, [refreshLiveAccountData]);

  const refreshSimulationStatus = useCallback(async () => {
    const status = await getSimulationStatus();
    if (status) {
      setIsAutoTickerEnabled(status.enabled);
    }
  }, []);

  const handleAutoTickerToggle = useCallback(async () => {
    setIsTogglingTicker(true);
    try {
      if (isAutoTickerEnabled) {
        await stopSimulationTicker();
        setIsAutoTickerEnabled(false);
        setBackendMessage("Auto ticker stopped");
      } else {
        await startSimulationTicker();
        setIsAutoTickerEnabled(true);
        setBackendMessage("Auto ticker started");
        // Force an immediate UI fetch so the user sees instant feedback
        setPriceRefreshVersion((v) => v + 1);
        void refreshLiveAccountData();
      }
      setBackendStatus("connected");
    } catch (error) {
      setBackendStatus("disconnected");
      setBackendMessage(error instanceof Error ? error.message : "Could not toggle auto ticker");
    } finally {
      setIsTogglingTicker(false);
    }
  }, [isAutoTickerEnabled]);


  const handleAddWatchlist = useCallback(async (item: ApiWatchlistItem) => {
    const user = auth.currentUser;
    if (!user) {
      setTradeMessage("Please sign in again to update your watchlist.");
      return;
    }

    try {
      const token = await user.getIdToken();
      const saved = await addWatchlistItem(token, {
        symbol: item.ticker,
        exchange: item.exchange,
        companyName: item.companyName,
      });

      if (!saved) {
        return;
      }

      setWatchlist((previous) => {
        const filtered = previous.filter(
          (entry) => !(entry.ticker === saved.ticker && entry.exchange === saved.exchange),
        );
        return [...filtered, saved].sort((left, right) => left.ticker.localeCompare(right.ticker));
      });
    } catch (error) {
      setTradeMessage(error instanceof Error ? error.message : "Could not update watchlist.");
    }
  }, []);

  const handleRemoveWatchlist = useCallback(async (item: ApiWatchlistItem) => {
    const user = auth.currentUser;
    if (!user) {
      setTradeMessage("Please sign in again to update your watchlist.");
      return;
    }

    try {
      const token = await user.getIdToken();
      await removeWatchlistItem(token, { symbol: item.ticker, exchange: item.exchange });
      setWatchlist((previous) =>
        previous.filter(
          (entry) => !(entry.ticker === item.ticker && entry.exchange === item.exchange),
        ),
      );
    } catch (error) {
      setTradeMessage(error instanceof Error ? error.message : "Could not update watchlist.");
    }
  }, []);

  const handlePlaceLimitOrder = useCallback(async (request: PlaceLimitOrderRequest) => {
    const user = auth.currentUser;
    if (!user) {
      setTradeMessage("Please sign in again to place a limit order.");
      return;
    }

    try {
      const token = await user.getIdToken();
      const saved = await placeLimitOrder(token, request);
      if (saved) {
        setPendingLimitOrders((previous) => [saved, ...previous]);
      }
      setTradeMessage(null);
    } catch (error) {
      setTradeMessage(error instanceof Error ? error.message : "Could not place limit order.");
    }
  }, []);

  const handleExecuteTrade = useCallback(
    async (trade: TradeDraft, shares: number) => {
      setTradeMessage(null);

      if (trade.type === "sell") {
        const availableShares =
          holdings.find((holding) => holding.ticker === trade.ticker)?.quantity ?? 0;

        if (shares > availableShares) {
          setTradeMessage(`Cannot sell ${shares} shares of ${trade.ticker}.`);
          return;
        }
      }

      if (!trade.exchange) {
        setTradeMessage(`Exchange is missing for ${trade.ticker}.`);
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        setTradeMessage("Please sign in again to place a trade.");
        return;
      }

      try {
        const token = await user.getIdToken();
        const request = {
          symbol: trade.ticker,
          exchange: trade.exchange,
          quantity: shares,
        };
        const tradeResult =
          trade.type === "buy"
            ? await executeBuyTrade(token, request)
            : await executeSellTrade(token, request);

        const immediatePortfolio = tradeResult.portfolio;
        const immediateHoldings = tradeResult.holdings ?? [];

        if (immediatePortfolio) {
          setBuyingPower(immediatePortfolio.buyingPower ?? INITIAL_BUYING_POWER);
          setTotalPortfolioValue(immediatePortfolio.totalPortfolioValue ?? INITIAL_BUYING_POWER);
          setPortfolioSnapshot(mapPortfolioMetrics(immediatePortfolio));
        }
        if (immediateHoldings.length > 0 || trade.type === "sell") {
          setHoldings(immediateHoldings.map(mapHolding));
        }

        const [portfolio, holdingsData, transactionsData] = await Promise.all([
          getPortfolio(token),
          getHoldings(token),
          getTransactions(token),
        ]);

        setTransactions(processTransactions(transactionsData.map(mapTransaction)));
        setHoldings(holdingsData.map(mapHolding));
        setBuyingPower(portfolio?.buyingPower ?? INITIAL_BUYING_POWER);
        setTotalPortfolioValue(portfolio?.totalPortfolioValue ?? INITIAL_BUYING_POWER);
        setPortfolioSnapshot(mapPortfolioMetrics(portfolio));
        setTradeMessage(null);
      } catch (error) {
        setTradeMessage(error instanceof Error ? error.message : "Trade execution failed.");
      }
    },
    [holdings],
  );


  const portfolioMetrics: PortfolioMetrics = useMemo(() => {
    const investmentValue = holdings.reduce(
      (sum, holding) => sum + (holding.holdPrice ?? 0) * (holding.quantity ?? 0),
      0,
    );
    const marketValue = holdings.reduce(
      (sum, holding) => sum + (holding.currentPrice ?? 0) * (holding.quantity ?? 0),
      0,
    );
    const unrealisedPL = marketValue - investmentValue;
    const todaysPL = holdings.reduce((sum, holding) => sum + (holding.totalPL ?? 0), 0);
    return {
      totalPortfolioValue: portfolioSnapshot?.totalPortfolioValue ?? totalPortfolioValue,
      investmentValue: portfolioSnapshot?.investmentValue ?? investmentValue,
      unrealisedPL: portfolioSnapshot?.unrealisedPL ?? unrealisedPL,
      todaysPL: portfolioSnapshot?.todaysPL ?? todaysPL,
      buyingPower: portfolioSnapshot?.buyingPower ?? buyingPower,
    };
  }, [buyingPower, holdings, portfolioSnapshot, totalPortfolioValue]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  useEffect(() => {
    const initialTab = getTabFromSearch(window.location.search);
    setActiveTab(initialTab);
    window.history.replaceState({ dashboardTab: initialTab }, "", getDashboardTabUrl(initialTab));

    const handlePopState = () => {
      setActiveTab(getTabFromSearch(window.location.search));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkBackend = async () => {
      const result = await getBackendHealth();
      if (!isMounted) {
        return;
      }
      setBackendStatus(result.ok ? "connected" : "disconnected");
      setBackendMessage(result.message ?? (result.ok ? "Backend connected" : "Backend unreachable"));
      if (result.ok) {
        void refreshSimulationStatus();
      }
    };

    void checkBackend();
    const interval = window.setInterval(checkBackend, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [refreshSimulationStatus]);

  useEffect(() => {
    publishPortfolioSnapshot({
      totalPortfolioValue:
        portfolioMetrics.totalPortfolioValue ?? DEFAULT_PORTFOLIO_SNAPSHOT.totalPortfolioValue,
      investmentValue: portfolioMetrics.investmentValue ?? DEFAULT_PORTFOLIO_SNAPSHOT.investmentValue,
      unrealisedPL: portfolioMetrics.unrealisedPL ?? DEFAULT_PORTFOLIO_SNAPSHOT.unrealisedPL,
      todaysPL: portfolioMetrics.todaysPL ?? DEFAULT_PORTFOLIO_SNAPSHOT.todaysPL,
      buyingPower: portfolioMetrics.buyingPower ?? DEFAULT_PORTFOLIO_SNAPSHOT.buyingPower,
    });
  }, [portfolioMetrics]);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (isMounted) {
          router.push("/");
        }
        return;
      }

      if (isMounted) {
        setUserName(user.displayName || user.email?.split("@")[0] || "Trader");
      }

      try {
        const token = await user.getIdToken();
        await initCurrentUser(token);

        const [portfolio, holdingsData, transactionsData, watchlistData, limitOrdersData] =
          await Promise.allSettled([
            getPortfolio(token),
            getHoldings(token),
            getTransactions(token),
            getWatchlist(token),
            getLimitOrders(token),
          ]);

        if (!isMounted) {
          return;
        }

        setHoldings(holdingsData.status === "fulfilled" ? holdingsData.value.map(mapHolding) : []);
        setTransactions(
          transactionsData.status === "fulfilled"
            ? processTransactions(transactionsData.value.map(mapTransaction))
            : [],
        );
        setWatchlist(watchlistData.status === "fulfilled" ? watchlistData.value : []);
        setPendingLimitOrders(limitOrdersData.status === "fulfilled" ? limitOrdersData.value : []);
        setBuyingPower(
          portfolio.status === "fulfilled"
            ? portfolio.value?.buyingPower ?? INITIAL_BUYING_POWER
            : INITIAL_BUYING_POWER,
        );
        setPortfolioSnapshot(
          portfolio.status === "fulfilled" ? mapPortfolioMetrics(portfolio.value) : null,
        );
        setTotalPortfolioValue(
          portfolio.status === "fulfilled"
            ? portfolio.value?.totalPortfolioValue ?? INITIAL_BUYING_POWER
            : INITIAL_BUYING_POWER,
        );

        const loadErrors = [
          portfolio.status === "rejected"
            ? `portfolio: ${portfolio.reason instanceof Error ? portfolio.reason.message : "failed"}`
            : null,
          holdingsData.status === "rejected"
            ? `holdings: ${holdingsData.reason instanceof Error ? holdingsData.reason.message : "failed"}`
            : null,
          transactionsData.status === "rejected"
            ? `transactions: ${transactionsData.reason instanceof Error ? transactionsData.reason.message : "failed"}`
            : null,
          watchlistData.status === "rejected"
            ? `watchlist: ${watchlistData.reason instanceof Error ? watchlistData.reason.message : "failed"}`
            : null,
          limitOrdersData.status === "rejected"
            ? `limit orders: ${limitOrdersData.reason instanceof Error ? limitOrdersData.reason.message : "failed"}`
            : null,
        ].filter(Boolean);

        setTradeMessage(loadErrors.length > 0 ? `Some data could not load: ${loadErrors.join(" | ")}` : null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setTradeMessage(
          error instanceof Error
            ? error.message
            : "Could not load your portfolio data from backend.",
        );
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  // Removed default 30s background polling. Now relies entirely on manual Refresh or Auto Ticker.

  // BUG FIX: When "Start Auto" is on, aggressively poll for new prices so the UI actually moves
  useEffect(() => {
    if (!isAutoTickerEnabled) return;

    let isMounted = true;
    const interval = window.setInterval(() => {
      if (!isMounted) return;
      // Force charts & buy page to re-fetch their data
      setPriceRefreshVersion((v) => v + 1);
      // Refresh portfolio holdings value
      void refreshLiveAccountData();
    }, 30000); // 30 seconds to refresh UI when auto is on

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [isAutoTickerEnabled, refreshLiveAccountData]);

  return (
    <main className={`ta-dashboard ${isDarkMode ? "dark" : "light"}`}>
      <DashboardTopbar
        activeTab={activeTab}
        isDarkMode={isDarkMode}
        userName={userName}
        backendStatus={backendStatus}
        backendMessage={backendMessage}
        isAutoTickerEnabled={isAutoTickerEnabled}
        isTogglingTicker={isTogglingTicker}
        isRefreshingPrices={isRefreshingPrices}
        onTabChange={handleTabChange}
        onThemeToggle={handleThemeToggle}
        onLogout={handleLogout}
        onAutoTickerToggle={handleAutoTickerToggle}
        onRefreshPrices={handleRefreshPrices}
        onResetPortfolio={handleResetPortfolio}
      />
      <StockTickerTape
        priceRefreshVersion={priceRefreshVersion}
        holdings={holdings}
        watchlist={watchlist}
      />
      <DashboardContent
        activeTab={activeTab}
        portfolioMetrics={portfolioMetrics}
        holdings={holdings}
        isDarkMode={isDarkMode}
        transactions={transactions}
        watchlist={watchlist}
        onExecuteTrade={handleExecuteTrade}
        onAddWatchlist={handleAddWatchlist}
        onRemoveWatchlist={handleRemoveWatchlist}
        pendingLimitOrders={pendingLimitOrders}
        onPlaceLimitOrder={handlePlaceLimitOrder}
        onPreviewNavigate={handleTabChange}
        priceRefreshVersion={priceRefreshVersion}
        onOpenBuyStock={handleOpenBuyStock}
        buyNavigationStock={buyNavigationStock}
        customWatchlists={customWatchlists}
        onSetCustomWatchlists={setCustomWatchlists}
      />
      {tradeMessage ? <p className="ta-global-message">{tradeMessage}</p> : null}
    </main>
  );
}
