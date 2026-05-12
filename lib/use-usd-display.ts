"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ta_show_usd_equivalents";
const EVENT_NAME = "ta-usd-display-change";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStored(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function useUsdEquivalents() {
  const [showUsdEquivalents, setShowUsdEquivalents] = useState(false);

  useEffect(() => {
    setShowUsdEquivalents(readStored());
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      setShowUsdEquivalents(readStored());
    };
    const onCustom = () => setShowUsdEquivalents(readStored());
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setShowUsdEquivalents(next);
    writeStored(next);
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!readStored());
  }, [setEnabled]);

  return { showUsdEquivalents, setShowUsdEquivalents: setEnabled, toggle };
}

