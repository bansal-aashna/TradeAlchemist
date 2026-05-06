"use client";

import { memo, useEffect, useRef, useState } from "react";

type ProfileMenuProps = {
  onLogout: () => Promise<void>;
  isDarkMode: boolean;
  backendStatus: "connected" | "disconnected";
  backendMessage: string;
  isAutoTickerEnabled: boolean;
  isTogglingTicker: boolean;
  isRefreshingPrices: boolean;
  onAutoTickerToggle: () => Promise<void>;
  onRefreshPrices: () => Promise<void>;
};

export const ProfileMenu = memo(function ProfileMenu({
  onLogout,
  isDarkMode,
  backendStatus,
  backendMessage,
  isAutoTickerEnabled,
  isTogglingTicker,
  isRefreshingPrices,
  onAutoTickerToggle,
  onRefreshPrices,
}: ProfileMenuProps) {

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = async () => {
    await onLogout();
    setIsMenuOpen(false);
  };

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div className="ta-profile-menu" ref={menuRef}>
     <button
        type="button"
        className="ta-profile-button"
        onClick={() => setIsMenuOpen((current) => !current)}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
      >
        <img
          src={isDarkMode ? "/profile-dark.png" : "/profile-light.png"}
          alt="Profile"
          className="ta-profile-icon"
        />
      </button>
      {isMenuOpen ? (
        <div className="ta-profile-dropdown" role="menu">
          <div className="ta-profile-backend-tools">
            <div className="ta-profile-backend-head">
              <span className="ta-profile-backend-inline">
                <span className={`ta-backend-status-pill ${backendStatus}`}>
                  Backend: {backendStatus === "connected" ? "Connected" : "Disconnected"}
                </span>
                <span className={`ta-auto-ticker-pill ${isAutoTickerEnabled ? "on" : "off"}`}>
                  Auto: {isAutoTickerEnabled ? "On" : "Off"}
                </span>
              </span>
            </div>
            <span className="ta-backend-status-text">{backendMessage}</span>
            <div className="ta-profile-backend-actions">
              <button
                type="button"
                role="menuitem"
                className="ta-profile-action-btn"
                onClick={async () => {
                  await onAutoTickerToggle();
                }}
                disabled={isTogglingTicker}
              >
                {isTogglingTicker ? "Updating..." : isAutoTickerEnabled ? "Stop Auto" : "Start Auto"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="ta-price-refresh-btn ta-profile-refresh-btn"
                onClick={async () => {
                  await onRefreshPrices();
                }}
                disabled={isRefreshingPrices}
                aria-label={isRefreshingPrices ? "Refreshing prices" : "Refresh prices"}
                title={isRefreshingPrices ? "Refreshing prices" : "Refresh prices"}
              >
                <img
                  src="/refresh.png"
                  alt=""
                  className={`ta-price-refresh-icon ${isRefreshingPrices ? "spinning" : ""}`}
                />
              </button>
            </div>
          </div>
          <div className="ta-profile-menu-actions">
            <button type="button" role="menuitem">
              Settings
            </button>
            <button type="button" role="menuitem" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
