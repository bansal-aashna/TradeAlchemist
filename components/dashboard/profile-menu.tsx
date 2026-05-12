"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  updatePassword,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

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
  onResetPortfolio: () => Promise<void>;
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
  onResetPortfolio,
}: ProfileMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ── Username state ──
  const [newUsername, setNewUsername] = useState("");
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Password state ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Reset state ──
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = async () => {
    await onLogout();
    setIsMenuOpen(false);
  };

  const handleOpenSettings = () => {
    setIsMenuOpen(false);
    // Reset all form state
    setNewUsername("");
    setUsernameMsg(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMsg(null);
    setResetConfirm(false);
    setResetMessage(null);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    setResetConfirm(false);
    setResetMessage(null);
    setUsernameMsg(null);
    setPasswordMsg(null);
  };

  // ── Update username ──
  const handleUpdateUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) {
      setUsernameMsg({ text: "Please enter a new display name.", ok: false });
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setUsernameMsg({ text: "Not signed in. Please refresh and try again.", ok: false });
      return;
    }
    setIsUpdatingUsername(true);
    setUsernameMsg(null);
    try {
      await updateProfile(user, { displayName: trimmed });
      setUsernameMsg({ text: `Display name updated to "${trimmed}".`, ok: true });
      setNewUsername("");
    } catch (err) {
      setUsernameMsg({
        text: err instanceof Error ? err.message : "Failed to update display name.",
        ok: false,
      });
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  // ── Update password ──
  const handleUpdatePassword = async () => {
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordMsg({ text: "Please enter your current password.", ok: false });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ text: "New password must be at least 6 characters.", ok: false });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "New passwords do not match.", ok: false });
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setPasswordMsg({ text: "Not signed in. Please refresh and try again.", ok: false });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      // Re-authenticate before sensitive operation
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordMsg({ text: "Password updated successfully.", ok: true });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      setPasswordMsg({
        text: msg.includes("wrong-password") || msg.includes("invalid-credential")
          ? "Current password is incorrect."
          : msg,
        ok: false,
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // ── Reset portfolio ──
  const handleResetClick = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    void (async () => {
      setIsResetting(true);
      setResetMessage(null);
      try {
        await onResetPortfolio();
        setResetMessage({ text: "Portfolio reset successfully! Starting balance restored to $100,000.", ok: true });
        setResetConfirm(false);
      } catch (error) {
        setResetMessage({
          text: error instanceof Error ? error.message : "Reset failed. Please try again.",
          ok: false,
        });
        setResetConfirm(false);
      } finally {
        setIsResetting(false);
      }
    })();
  };

  // Close dropdown on outside click / escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  // Close settings modal on escape
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleCloseSettings();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen]);

  return (
    <>
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
              {backendMessage && backendMessage.toLowerCase() !== "ok" ? (
                <span className="ta-backend-status-text">{backendMessage}</span>
              ) : null}
              <div className="ta-profile-backend-actions">
                <button
                  type="button"
                  role="menuitem"
                  className="ta-profile-action-btn ta-profile-icon-action"
                  onClick={async () => { await onAutoTickerToggle(); }}
                  disabled={isTogglingTicker}
                  aria-label={isAutoTickerEnabled ? "Stop Auto" : "Start Auto"}
                  title={isAutoTickerEnabled ? "Stop Auto" : "Start Auto"}
                  data-tooltip={isAutoTickerEnabled ? "Stop Auto" : "Start Auto"}
                >
                  <img
                    src={isAutoTickerEnabled ? "/auto-stop.png" : "/auto-start.png"}
                    alt=""
                    className="ta-profile-action-icon"
                  />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="ta-price-refresh-btn ta-profile-refresh-btn ta-profile-icon-action"
                  onClick={async () => { await onRefreshPrices(); }}
                  disabled={isRefreshingPrices}
                  aria-label={isRefreshingPrices ? "Refreshing prices" : "Refresh prices"}
                  title={isRefreshingPrices ? "Refreshing prices" : "Refresh prices"}
                  data-tooltip={isRefreshingPrices ? "Refreshing prices" : "Refresh prices"}
                >
                  <img
                    src="/refresh.png"
                    alt=""
                    className={`ta-price-refresh-icon ${isRefreshingPrices ? "spinning" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="ta-profile-icon-action"
                  onClick={handleOpenSettings}
                  aria-label="Settings"
                  title="Settings"
                  data-tooltip="Settings"
                >
                  <img src="/settings.png" alt="" className="ta-profile-action-icon" />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="ta-profile-icon-action"
                  onClick={handleLogout}
                  aria-label="Logout"
                  title="Logout"
                  data-tooltip="Logout"
                >
                  <img src="/logout.png" alt="" className="ta-profile-action-icon" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ══════════ Settings Modal ══════════ */}
      {isSettingsOpen ? (
        <div
          className="ta-settings-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleCloseSettings(); }}
        >
          <div className="ta-settings-modal" ref={settingsRef}>

            {/* Header */}
            <div className="ta-settings-header">
              <div className="ta-settings-header-left">
                <h2 className="ta-settings-title">Settings</h2>
              </div>
              <button
                type="button"
                className="ta-settings-close"
                onClick={handleCloseSettings}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="ta-settings-body">

              {/* ── Change Username ── */}
              <section className="ta-settings-section">
                <div className="ta-settings-section-header">
                  <h3 className="ta-settings-section-title ta-settings-section-title--lg">
                    Change Display Name
                  </h3>
                </div>
                <p className="ta-settings-section-desc">
                  Update the name shown in the top bar.
                </p>
                {usernameMsg ? (
                  <div className={`ta-settings-reset-message ${usernameMsg.ok ? "success" : "error"}`}>
                    {usernameMsg.ok ? "✅" : "❌"} {usernameMsg.text}
                  </div>
                ) : null}
                <div className="ta-settings-form-group">
                  <input
                    id="settings-new-username"
                    type="text"
                    className="ta-settings-input"
                    placeholder="New display name"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleUpdateUsername(); }}
                    disabled={isUpdatingUsername}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="ta-settings-btn-primary"
                    onClick={() => void handleUpdateUsername()}
                    disabled={isUpdatingUsername || !newUsername.trim()}
                    id="settings-update-username-btn"
                  >
                    {isUpdatingUsername ? "Saving…" : "Save Name"}
                  </button>
                </div>
              </section>

              {/* ── Change Password ── */}
              <section className="ta-settings-section">
                <div className="ta-settings-section-header">
                  <h3 className="ta-settings-section-title ta-settings-section-title--lg">
                    Change Password
                  </h3>
                </div>
                <p className="ta-settings-section-desc">
                  Enter your current password and choose a new one (min. 6 characters).
                </p>
                {passwordMsg ? (
                  <div className={`ta-settings-reset-message ${passwordMsg.ok ? "success" : "error"}`}>
                    {passwordMsg.ok ? "✅" : "❌"} {passwordMsg.text}
                  </div>
                ) : null}
                <div className="ta-settings-form-stack">
                  <input
                    id="settings-current-password"
                    type="password"
                    className="ta-settings-input"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                    autoComplete="current-password"
                  />
                  <input
                    id="settings-new-password"
                    type="password"
                    className="ta-settings-input"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                    autoComplete="new-password"
                  />
                  <input
                    id="settings-confirm-password"
                    type="password"
                    className="ta-settings-input"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleUpdatePassword(); }}
                    disabled={isUpdatingPassword}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="ta-settings-btn-primary"
                    onClick={() => void handleUpdatePassword()}
                    disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword}
                    id="settings-update-password-btn"
                  >
                    {isUpdatingPassword ? "Updating…" : "Update Password"}
                  </button>
                </div>
              </section>

              {/* ── Reset Portfolio (Danger Zone) ── */}
              <section className="ta-settings-section ta-settings-danger-zone">
                <div className="ta-settings-section-header">
                  <h3 className="ta-settings-section-title ta-settings-section-title--lg">
                    Reset Portfolio
                  </h3>
                </div>
                <p className="ta-settings-section-desc">
                  Permanently deletes all holdings, transactions, watchlist entries, and limit orders.
                  Your buying power will be restored to <strong>$100,000</strong>. This action cannot be undone.
                </p>

                {resetMessage ? (
                  <div className={`ta-settings-reset-message ${resetMessage.ok ? "success" : "error"}`}>
                    {resetMessage.ok ? "✅" : "❌"} {resetMessage.text}
                  </div>
                ) : null}

                <div className="ta-settings-reset-actions">
                  {resetConfirm ? (
                    <>
                      <p className="ta-settings-confirm-text">
                        Are you sure? Click &ldquo;Confirm Reset&rdquo; to permanently wipe your portfolio.
                      </p>
                      <div className="ta-settings-confirm-btns">
                        <button
                          type="button"
                          className="ta-settings-btn-cancel"
                          onClick={() => setResetConfirm(false)}
                          disabled={isResetting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="ta-settings-btn-danger ta-settings-btn-confirm"
                          onClick={handleResetClick}
                          disabled={isResetting}
                        >
                          {isResetting ? "Resetting…" : "Confirm Reset"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ta-settings-btn-danger"
                      onClick={handleResetClick}
                      disabled={isResetting}
                      id="settings-reset-portfolio-btn"
                    >
                      🗑️ Reset Portfolio
                    </button>
                  )}
                </div>
              </section>

            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});
