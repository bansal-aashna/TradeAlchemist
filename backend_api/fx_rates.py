from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

try:
    from db.mongo_client import fx_rates as fx_rates_collection
except Exception:  # pragma: no cover
    fx_rates_collection = None


PRIMARY_USD_RATES_URL = (
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
)
FALLBACK_USD_RATES_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json"

DEFAULT_TIMEOUT_SECONDS = 8
DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24  # 24h


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_json(url: str, timeout_seconds: int) -> dict[str, Any]:
    req = Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "User-Agent": "TradeAlchemist/1.0 (+fx_rates)",
        },
    )
    with urlopen(req, timeout=timeout_seconds) as resp:
        payload = resp.read()
    return json.loads(payload.decode("utf-8"))


def fetch_usd_base_rates(timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    last_exc: Exception | None = None
    for url in (PRIMARY_USD_RATES_URL, FALLBACK_USD_RATES_URL):
        try:
            return _fetch_json(url, timeout_seconds=timeout_seconds)
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last_exc = exc
            continue
    raise RuntimeError(f"FX fetch failed ({type(last_exc).__name__}: {last_exc})")


def _get_cached_doc() -> dict[str, Any] | None:
    if fx_rates_collection is None:
        return None
    doc = fx_rates_collection.find_one({"base": "usd"}, {"_id": 0})
    return doc if isinstance(doc, dict) else None


def _doc_age_seconds(doc: Mapping[str, Any]) -> float | None:
    fetched_at = doc.get("fetchedAt")
    if not isinstance(fetched_at, str) or not fetched_at:
        return None
    try:
        dt = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())


def get_usd_base_rates(
    *,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    allow_stale_fallback: bool = True,
) -> dict[str, Any]:
    cached = _get_cached_doc()
    age = _doc_age_seconds(cached) if cached else None

    should_refresh = cached is None or age is None or age > max_age_seconds
    if not should_refresh:
        return dict(cached)

    try:
        fresh = fetch_usd_base_rates(timeout_seconds=timeout_seconds)
        usd_map = fresh.get("usd")
        if not isinstance(usd_map, dict) or not usd_map:
            raise RuntimeError("FX response missing 'usd' rates map")
        doc = {
            "base": "usd",
            "date": fresh.get("date"),
            "rates": usd_map,
            "fetchedAt": utc_now_iso(),
        }
        if fx_rates_collection is not None:
            fx_rates_collection.update_one({"base": "usd"}, {"$set": doc}, upsert=True)
        return doc
    except Exception:
        if allow_stale_fallback and cached is not None:
            return dict(cached)
        raise


def currency_to_usd_rate(currency: str | None, rates_doc: Mapping[str, Any]) -> float:
    code = (currency or "USD").strip()
    if not code:
        code = "USD"

    upper = code.upper()
    if upper == "USD":
        return 1.0

    rates = rates_doc.get("rates")
    if not isinstance(rates, dict) or not rates:
        raise ValueError("FX rates cache is empty")

    def usd_to(code_lower: str) -> float:
        raw = rates.get(code_lower)
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = 0.0
        if value <= 0:
            raise ValueError(f"FX rate missing for USD→{code_lower.upper()}")
        return value

    # GBp (pence notation from Yahoo Finance) and GBP are both treated as pounds sterling.
    if upper == "GBP":
        usd_to_gbp = usd_to("gbp")
        return 1.0 / usd_to_gbp

    usd_to_target = usd_to(upper.lower())
    return 1.0 / usd_to_target


def convert_native_to_usd(amount_native: float, currency: str | None, rates_doc: Mapping[str, Any]) -> float:
    rate = currency_to_usd_rate(currency, rates_doc)
    return amount_native * rate
