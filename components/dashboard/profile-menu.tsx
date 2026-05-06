"use client";

import { memo, useEffect, useRef, useState } from "react";

type ProfileMenuProps = {
  onLogout: () => Promise<void>;
  isDarkMode: boolean;   // 👈 ADD THIS
};

export const ProfileMenu = memo(function ProfileMenu({
  onLogout,
  isDarkMode,
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
          <button type="button" role="menuitem">
            Settings
          </button>
          <button type="button" role="menuitem" onClick={handleLogout}>
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
});
