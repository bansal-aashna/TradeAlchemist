"use client";

import { memo } from "react";
import type { DashboardTab } from "@/components/dashboard/tabs";
import { DashboardTabsNav } from "@/components/dashboard/dashboard-tabs-nav";
import { ProfileMenu } from "@/components/dashboard/profile-menu";
import { useUsdEquivalents } from "@/lib/use-usd-display";

type DashboardTopbarProps = {
  activeTab: DashboardTab;
  isDarkMode: boolean;
  userName?: string | null;
  backendStatus: "connected" | "disconnected";
  backendMessage: string;
  isAutoTickerEnabled: boolean;
  isTogglingTicker: boolean;
  isRefreshingPrices: boolean;
  onTabChange: (tab: DashboardTab) => void;
  onThemeToggle: () => void;
  onLogout: () => Promise<void>;
  onAutoTickerToggle: () => Promise<void>;
  onRefreshPrices: () => Promise<void>;
  onResetPortfolio: () => Promise<void>;
};

export const DashboardTopbar = memo(function DashboardTopbar({
  activeTab,
  isDarkMode,
  userName,
  backendStatus,
  backendMessage,
  isAutoTickerEnabled,
  isTogglingTicker,
  isRefreshingPrices,
  onTabChange,
  onThemeToggle,
  onLogout,
  onAutoTickerToggle,
  onRefreshPrices,
  onResetPortfolio,
}: DashboardTopbarProps) {
  const { showUsdEquivalents, toggle } = useUsdEquivalents();
  return (
    <header className="ta-topbar">
      <div className="ta-topbar-left">
        <button
          type="button"
          className="ta-brand ta-brand-btn"
          onClick={() => onTabChange("Dashboard")}
          aria-label="Go to Dashboard"
        >
          <img
            src={isDarkMode ? "/logo-dark.png" : "/logo-light.png"}
            alt="TradeAlchemist Logo"
          />
          <h1 className="ta-app-name">TradeAlchemist</h1>
        </button>

        <DashboardTabsNav activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      <div className="ta-topbar-right">
        <div className="ta-currency-pill-wrap">
          <button
            type="button"
            className={`ta-currency-pill-btn ${!showUsdEquivalents ? "active" : ""}`}
            onClick={() => { if (showUsdEquivalents) toggle(); }}
          >
            Native
          </button>
          <button
            type="button"
            className={`ta-currency-pill-btn ${showUsdEquivalents ? "active" : ""}`}
            onClick={() => { if (!showUsdEquivalents) toggle(); }}
          >
            USD
          </button>
        </div>
        <button
          type="button"
          className="ta-theme-toggle"
          onClick={onThemeToggle}
        >
          <img
            src={isDarkMode ? "/sun.png" : "/moon.png"}
            alt="Theme Toggle"
            className="ta-theme-icon"
          />
        </button>

        {userName ? <p className="ta-topbar-greeting">Hi, {userName}</p> : null}

        <ProfileMenu
          onLogout={onLogout}
          isDarkMode={isDarkMode}
          backendStatus={backendStatus}
          backendMessage={backendMessage}
          isAutoTickerEnabled={isAutoTickerEnabled}
          isTogglingTicker={isTogglingTicker}
          isRefreshingPrices={isRefreshingPrices}
          onAutoTickerToggle={onAutoTickerToggle}
          onRefreshPrices={onRefreshPrices}
          onResetPortfolio={onResetPortfolio}
        />
      </div>
    </header>
  );
});
