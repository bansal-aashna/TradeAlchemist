import os
import re
import asyncio
import webbrowser
import threading
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager, suppress
from fastapi.responses import JSONResponse
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from db.mongo_client import (
    historical_prices,
    live_prices,
    market_state,
    metadata,
    portfolios,
    holdings,
    limit_orders,
    transactions,
    users,
    watchlists,
)
from trade_executor import execute_trade, process_pending_limit_orders
from auth_utils import get_current_user
from simulator_tick import run_price_tick
from fx_rates import currency_to_usd_rate, get_usd_base_rates


PRICE_TICK_INTERVAL_SECONDS = int(os.getenv("PRICE_TICK_INTERVAL_SECONDS", "30"))
ENABLE_PRICE_TICKER = os.getenv("ENABLE_PRICE_TICKER", "false").lower() == "true"
PRICE_TICKER_TASK = None


async def price_ticker_loop():
    while True:
        try:
            summary = await asyncio.to_thread(run_price_tick)
            order_summary = await asyncio.to_thread(process_pending_limit_orders)
            print(
                "Price tick complete | "
                f"Updated {summary['updated']} stocks | State {summary['state']} | "
                f"Limit orders executed {order_summary['executed']}"
            )
        except Exception as exc:
            print(f"Price tick failed: {exc}")
        await asyncio.sleep(PRICE_TICK_INTERVAL_SECONDS)


def is_price_ticker_running():
    return PRICE_TICKER_TASK is not None and not PRICE_TICKER_TASK.done()


def start_price_ticker():
    global PRICE_TICKER_TASK
    if is_price_ticker_running():
        return False
    PRICE_TICKER_TASK = asyncio.create_task(price_ticker_loop())
    return True


def stop_price_ticker():
    global PRICE_TICKER_TASK
    if not is_price_ticker_running():
        PRICE_TICKER_TASK = None
        return False
    PRICE_TICKER_TASK.cancel()
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup logic ---
    if os.getenv("AUTO_OPEN_DOCS", "false").lower() == "true":
        host = os.getenv("APP_HOST", "127.0.0.1")
        port = os.getenv("APP_PORT", "8000")
        url = f"http://{host}:{port}/docs"

        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    if ENABLE_PRICE_TICKER:
        start_price_ticker()

    try:
        yield
    finally:
        if PRICE_TICKER_TASK:
            PRICE_TICKER_TASK.cancel()
            with suppress(asyncio.CancelledError):
                await PRICE_TICKER_TASK

    # --- shutdown logic (optional) ---

app = FastAPI(lifespan=lifespan)

# allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_STARTING_CAPITAL = 100000

EXCHANGE_TO_METADATA_CODE = {
    "NSE": "NSI",
    "BSE": "BSE",
    "NYSE": "NYQ",
    "NASDAQ": "NMS",
    "LSE": "LSE",
    "HKEX": "HKG",
    "SSE": "SSE",
    "ASX": "ASX",
    "TSX": "TOR",
    "JPX": "JPX",
    "NATIONAL STOCK EXCHANGE OF INDIA": "NSI",
    "BOMBAY STOCK EXCHANGE": "BSE",
    "NEW YORK STOCK EXCHANGE": "NYQ",
    "LONDON STOCK EXCHANGE": "LSE",
    "HONG KONG STOCK EXCHANGE": "HKG",
    "SHANGHAI STOCK EXCHANGE": "SSE",
    "AUSTRALIAN SECURITIES EXCHANGE": "ASX",
    "TORONTO STOCK EXCHANGE": "TOR",
    "TOKYO STOCK EXCHANGE": "JPX",
}


def normalize_exchange(exchange: Optional[str]) -> Optional[str]:
    if not exchange:
        return None
    normalized = exchange.strip().upper()
    return EXCHANGE_TO_METADATA_CODE.get(normalized, normalized)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_user_display_name(current_user: dict):
    return current_user.get("name") or current_user.get("email") or current_user["uid"]


def get_user_transaction_query(uid: str):
    return {"$or": [{"uid": uid}, {"user_id": uid}]}


def parse_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_transaction_datetime(document: dict):
    return (
        document.get("timestamp")
        or document.get("dateTime")
        or document.get("datetime")
        or document.get("createdAt")
        or utc_now_iso()
    )


def get_metadata_by_ticker(tickers: list[str]):
    if not tickers:
        return {}
    rows = list(metadata.find({"ticker": {"$in": tickers}}, {"_id": 0}))
    return {row.get("ticker"): row for row in rows if row.get("ticker")}


def get_live_prices_by_symbol(symbols: list[str]):
    if not symbols:
        return {}
    rows = list(live_prices.find({"symbol": {"$in": symbols}}, {"_id": 0}))
    return {row.get("symbol"): row for row in rows if row.get("symbol")}


def build_holdings_snapshot(uid: str, display_name: str):
    transaction_docs = list(
        transactions.find(get_user_transaction_query(uid)).sort("timestamp", 1)
    )

    try:
        rates_doc = get_usd_base_rates(allow_stale_fallback=True)
    except Exception:
        rates_doc = None

    aggregated = {}
    for document in transaction_docs:
        symbol = document.get("symbol") or document.get("ticker")
        exchange = document.get("exchange") or ""
        if not symbol:
            continue

        key = f"{symbol}::{exchange}"
        side = (document.get("side") or document.get("type") or "").upper()
        quantity = parse_int(document.get("quantity") or document.get("shares"))
        meta = metadata.find_one({"ticker": symbol}, {"_id": 0}) or {}
        currency = document.get("currency") or meta.get("currency") or "USD"

        fx_rate = parse_float(document.get("fxRateToUsd") or document.get("fx_rate_to_usd"))
        if fx_rate <= 0 and rates_doc is not None:
            try:
                fx_rate = currency_to_usd_rate(currency, rates_doc)
            except Exception:
                fx_rate = 0.0

        price_native = parse_float(
            document.get("priceNative") or document.get("price_native") or document.get("price")
        )
        price_usd = parse_float(document.get("priceUsd") or document.get("price_usd"))
        if price_usd <= 0 and fx_rate > 0:
            price_usd = round(price_native * fx_rate, 6)
        if price_usd <= 0:
            # Last resort: assume legacy data already stored in USD.
            price_usd = price_native

        if quantity <= 0:
            continue

        snapshot = aggregated.setdefault(
            key,
            {
                "ticker": symbol,
                "exchange": exchange,
                "quantity": 0,
                "cost_basis": 0.0,
                "currency": currency,
                "last_fx_rate_to_usd": fx_rate if fx_rate > 0 else None,
                "lastTradeAt": get_transaction_datetime(document),
            },
        )
        snapshot["lastTradeAt"] = get_transaction_datetime(document)
        if fx_rate > 0:
            snapshot["last_fx_rate_to_usd"] = fx_rate

        if side == "BUY":
            snapshot["quantity"] += quantity
            snapshot["cost_basis"] += price_usd * quantity
        elif side == "SELL":
            current_quantity = snapshot["quantity"]
            average_price = (
                snapshot["cost_basis"] / current_quantity if current_quantity > 0 else 0.0
            )
            sold_quantity = min(current_quantity, quantity)
            snapshot["quantity"] = max(0, current_quantity - quantity)
            snapshot["cost_basis"] = max(
                0.0,
                snapshot["cost_basis"] - (average_price * sold_quantity),
            )

    open_positions = [row for row in aggregated.values() if row["quantity"] > 0]
    tickers = [row["ticker"] for row in open_positions]
    metadata_by_ticker = get_metadata_by_ticker(tickers)
    live_by_symbol = get_live_prices_by_symbol(tickers)

    holdings_docs = []
    for row in open_positions:
        ticker = row["ticker"]
        current_quantity = row["quantity"]
        hold_price_usd = round(row["cost_basis"] / current_quantity, 6) if current_quantity > 0 else 0.0
        meta = metadata_by_ticker.get(ticker, {})
        live = live_by_symbol.get(ticker, {})
        currency = meta.get("currency") or row.get("currency") or "USD"
        current_price_native = parse_float(
            live.get("price")
            or live.get("currentPrice")
            or meta.get("lastClose")
            or meta.get("last_close")
        )
        fx_rate = row.get("last_fx_rate_to_usd")
        if not fx_rate and rates_doc is not None:
            try:
                fx_rate = currency_to_usd_rate(currency, rates_doc)
            except Exception:
                fx_rate = None
        if currency == "USD":
            fx_rate = 1.0
        fx_rate_value = float(fx_rate or 1.0)

        current_price_usd = round(current_price_native * fx_rate_value, 6)
        hold_price_native = round(hold_price_usd / fx_rate_value, 6) if fx_rate_value > 0 else None
        total_pl_usd = round((current_price_usd - hold_price_usd) * current_quantity, 2)
        holdings_docs.append(
            {
                "uid": uid,
                "displayName": display_name,
                "ticker": ticker,
                "companyName": meta.get("companyName") or meta.get("company_name") or ticker,
                "exchange": row["exchange"] or meta.get("exchange") or "",
                "sector": meta.get("sector"),
                "industry": meta.get("industry"),
                "quantity": current_quantity,
                "currency": currency,
                "fxRateToUsd": fx_rate_value,
                # Legacy fields (USD)
                "holdPrice": round(hold_price_usd, 2),
                "currentPrice": round(current_price_usd, 2),
                "totalPL": total_pl_usd,
                # Native fields
                "holdPriceNative": round(hold_price_native, 2) if hold_price_native is not None else None,
                "currentPriceNative": round(current_price_native, 2),
                "updatedAt": utc_now_iso(),
                "lastTradeAt": row["lastTradeAt"],
            }
        )

    holdings.delete_many({"uid": uid})
    if holdings_docs:
        holdings.insert_many([doc.copy() for doc in holdings_docs])

    return [{key: value for key, value in doc.items() if key != "_id"} for doc in holdings_docs]


def sync_portfolio_snapshot(uid: str, display_name: str):
    holdings_docs = build_holdings_snapshot(uid, display_name)

    portfolio_doc = portfolios.find_one({"uid": uid}, {"_id": 0}) or {
        "uid": uid,
        "buyingPower": DEFAULT_STARTING_CAPITAL,
    }
    buying_power = parse_float(portfolio_doc.get("buyingPower"), DEFAULT_STARTING_CAPITAL)
    investment_value = round(
        sum(parse_float(item.get("holdPrice")) * parse_int(item.get("quantity")) for item in holdings_docs),
        2,
    )
    market_value = round(
        sum(parse_float(item.get("currentPrice")) * parse_int(item.get("quantity")) for item in holdings_docs),
        2,
    )
    unrealised_pl = round(market_value - investment_value, 2)
    todays_pl = round(sum(parse_float(item.get("totalPL")) for item in holdings_docs), 2)
    total_portfolio_value = round(buying_power + market_value, 2)

    updated_portfolio = {
        "uid": uid,
        "displayName": display_name,
        "buyingPower": buying_power,
        "totalPortfolioValue": total_portfolio_value,
        "investmentValue": investment_value,
        "unrealisedPL": unrealised_pl,
        "todaysPL": todays_pl,
        "updatedAt": utc_now_iso(),
    }

    portfolios.update_one(
        {"uid": uid},
        {
            "$set": updated_portfolio,
            "$setOnInsert": {"createdAt": utc_now_iso()},
        },
        upsert=True,
    )

    return updated_portfolio, holdings_docs


def get_enriched_watchlist(uid: str):
    docs = list(
        watchlists.find({"uid": uid}, {"_id": 0}).sort("ticker", 1)
    )
    tickers = [doc.get("ticker") for doc in docs if doc.get("ticker")]
    metadata_by_ticker = get_metadata_by_ticker(tickers)
    live_by_symbol = get_live_prices_by_symbol(tickers)

    try:
        rates_doc = get_usd_base_rates(allow_stale_fallback=True)
    except Exception:
        rates_doc = None

    enriched = []
    for document in docs:
        ticker = document.get("ticker")
        meta = metadata_by_ticker.get(ticker, {})
        live = live_by_symbol.get(ticker, {})
        merged = {**meta, **live, **document}
        currency = merged.get("currency") or "USD"
        if rates_doc is not None and merged.get("price") is not None:
            try:
                fx_rate = currency_to_usd_rate(currency, rates_doc)
                merged["fxRateToUsd"] = fx_rate
                merged["currentPriceUsd"] = round(parse_float(merged.get("price")) * fx_rate, 6)
            except Exception:
                merged["fxRateToUsd"] = None
                merged["currentPriceUsd"] = None
        enriched.append(merged)

    return enriched


def normalize_limit_order(document: dict):
    return {
        "id": str(document.get("_id")),
        "uid": document.get("uid"),
        "displayName": document.get("displayName"),
        "symbol": document.get("symbol"),
        "ticker": document.get("symbol"),
        "companyName": document.get("companyName") or document.get("symbol"),
        "exchange": document.get("exchange") or "",
        "side": (document.get("side") or "").lower(),
        "quantity": parse_int(document.get("quantity")),
        "limitPrice": parse_float(document.get("limitPrice")),
        "currency": document.get("currency") or "USD",
        "status": document.get("status") or "pending",
        "currentPrice": parse_float(document.get("lastCheckedPrice")) or None,
        "executedPrice": parse_float(document.get("executedPrice")) or None,
        "executedPriceUsd": parse_float(document.get("executedPriceUsd")) or None,
        "failureReason": document.get("failureReason"),
        "createdAt": document.get("createdAt"),
        "updatedAt": document.get("updatedAt"),
        "executedAt": document.get("executedAt"),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    user_doc = users.find_one({"uid": current_user["uid"]}, {"_id": 0})
    portfolio_doc, _ = sync_portfolio_snapshot(
        current_user["uid"], get_user_display_name(current_user)
    )
    return {
        "auth": current_user,
        "user": user_doc,
        "portfolio": portfolio_doc,
    }


@app.post("/me/init")
def init_me(current_user: dict = Depends(get_current_user)):
    now = utc_now_iso()
    uid = current_user["uid"]
    display_name = get_user_display_name(current_user)

    user_exists = users.find_one({"uid": uid}, {"_id": 1}) is not None
    portfolio_exists = portfolios.find_one({"uid": uid}, {"_id": 1}) is not None

    users.update_one(
        {"uid": uid},
        {
            "$set": {
                "email": current_user.get("email"),
                "displayName": display_name,
                "updatedAt": now,
            },
            "$unset": {
                "photoURL": "",
            },
            "$setOnInsert": {
                "uid": uid,
                "createdAt": now,
            },
        },
        upsert=True,
    )

    portfolios.update_one(
        {"uid": uid},
        {
            "$set": {
                "displayName": display_name,
                "updatedAt": now,
            },
            "$setOnInsert": {
                "uid": uid,
                "buyingPower": DEFAULT_STARTING_CAPITAL,
                "totalPortfolioValue": DEFAULT_STARTING_CAPITAL,
                "investmentValue": 0,
                "unrealisedPL": 0,
                "todaysPL": 0,
                "createdAt": now,
            },
        },
        upsert=True,
    )

    watchlists.update_many({"uid": uid}, {"$set": {"displayName": display_name}})
    holdings.update_many({"uid": uid}, {"$set": {"displayName": display_name}})

    user_doc = users.find_one({"uid": uid}, {"_id": 0})
    portfolio_doc, _ = sync_portfolio_snapshot(uid, display_name)

    return {
        "status": "ok",
        "created": {
            "user": not user_exists,
            "portfolio": not portfolio_exists,
        },
        "user": user_doc,
        "portfolio": portfolio_doc,
    }


@app.get("/portfolio")
def get_portfolio(current_user: dict = Depends(get_current_user)):
    portfolio_doc, _ = sync_portfolio_snapshot(
        current_user["uid"], get_user_display_name(current_user)
    )
    return {"data": portfolio_doc}


@app.get("/holdings")
def get_holdings(current_user: dict = Depends(get_current_user)):
    _, holdings_docs = sync_portfolio_snapshot(
        current_user["uid"], get_user_display_name(current_user)
    )
    return {"data": holdings_docs}


@app.get("/transactions")
def get_transactions(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    docs = list(
        transactions.find(get_user_transaction_query(uid)).sort("timestamp", -1)
    )
    metadata_by_ticker = get_metadata_by_ticker(
        [doc.get("symbol") or doc.get("ticker") for doc in docs if doc.get("symbol") or doc.get("ticker")]
    )
    normalized = []
    for document in docs:
        ticker = document.get("symbol") or document.get("ticker")
        meta = metadata_by_ticker.get(ticker, {})
        currency = document.get("currency") or meta.get("currency") or "USD"
        price_native = parse_float(document.get("priceNative") or document.get("price_native"))
        if price_native <= 0:
            price_native = parse_float(document.get("price"))
        price_usd = parse_float(document.get("priceUsd") or document.get("price_usd"))
        if price_usd <= 0:
            price_usd = parse_float(document.get("price"))
        fx_rate_to_usd = parse_float(document.get("fxRateToUsd") or document.get("fx_rate_to_usd")) or None
        normalized.append(
            {
                "id": str(document.get("_id")),
                "uid": uid,
                "ticker": ticker,
                "company": document.get("company")
                or document.get("companyName")
                or meta.get("companyName")
                or ticker,
                "exchange": document.get("exchange") or meta.get("exchange") or "",
                "type": (document.get("side") or document.get("type") or "").lower(),
                "shares": parse_int(document.get("quantity") or document.get("shares")),
                # Back-compat: `price` is always USD now.
                "price": price_usd,
                "currency": currency,
                "fxRateToUsd": fx_rate_to_usd,
                "priceNative": price_native,
                "priceUsd": price_usd,
                "dateTime": get_transaction_datetime(document),
            }
        )
        normalized[-1]["totalValue"] = (
            parse_float(
                document.get("gross_value")
                or document.get("grossValue")
                or document.get("net_value")
                or document.get("netValue")
                or document.get("grossUsd")
                or document.get("netUsd")
            )
            or round(normalized[-1]["shares"] * normalized[-1]["price"], 2)
        )
    return {"data": normalized}


@app.get("/watchlist")
def get_watchlist(current_user: dict = Depends(get_current_user)):
    return {"data": get_enriched_watchlist(current_user["uid"])}


class WatchlistRequest(BaseModel):
    symbol: str
    exchange: str
    companyName: Optional[str] = None


class LimitOrderRequest(BaseModel):
    symbol: str
    exchange: str
    side: str
    quantity: int
    limitPrice: float
    companyName: Optional[str] = None


@app.post("/watchlist")
def add_watchlist_item(
    req: WatchlistRequest,
    current_user: dict = Depends(get_current_user),
):
    now = utc_now_iso()
    display_name = get_user_display_name(current_user)
    meta = metadata.find_one({"ticker": req.symbol}, {"_id": 0}) or {}
    document = {
        "uid": current_user["uid"],
        "displayName": display_name,
        "ticker": req.symbol,
        "exchange": req.exchange or meta.get("exchange") or "",
        "companyName": req.companyName or meta.get("companyName") or req.symbol,
        "updatedAt": now,
    }
    watchlists.update_one(
        {
            "uid": current_user["uid"],
            "ticker": req.symbol,
            "exchange": document["exchange"],
        },
        {
            "$set": document,
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )
    saved = next(
        (
            item
            for item in get_enriched_watchlist(current_user["uid"])
            if item.get("ticker") == req.symbol and item.get("exchange") == document["exchange"]
        ),
        None,
    )
    return {"status": "ok", "data": saved}


@app.delete("/watchlist/{symbol}")
def delete_watchlist_item(
    symbol: str,
    exchange: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"uid": current_user["uid"], "ticker": symbol}
    if exchange:
        query["exchange"] = exchange
    watchlists.delete_many(query)
    return {"status": "ok"}


@app.get("/limit-orders")
def get_limit_orders(status: Optional[str] = "pending", current_user: dict = Depends(get_current_user)):
    query = {"uid": current_user["uid"]}
    if status:
        query["status"] = status
    docs = list(limit_orders.find(query).sort("createdAt", -1))
    return {"data": [normalize_limit_order(doc) for doc in docs]}


@app.post("/limit-orders")
def place_limit_order(req: LimitOrderRequest, current_user: dict = Depends(get_current_user)):
    side = req.side.strip().upper()
    if side not in {"BUY", "SELL"}:
        raise HTTPException(status_code=400, detail="Limit order side must be buy or sell")
    if req.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    if req.limitPrice <= 0:
        raise HTTPException(status_code=400, detail="Limit price must be greater than 0")

    uid = current_user["uid"]
    display_name = get_user_display_name(current_user)
    meta = metadata.find_one({"ticker": req.symbol}, {"_id": 0}) or {}
    live = live_prices.find_one({"symbol": req.symbol, "exchange": req.exchange}, {"_id": 0})
    if not live:
        live = live_prices.find_one({"symbol": req.symbol}, {"_id": 0}) or {}
    currency = meta.get("currency") or live.get("currency") or "USD"
    current_price = parse_float(live.get("price"))

    if side == "SELL":
        _, holdings_docs = sync_portfolio_snapshot(uid, display_name)
        available_shares = next(
            (
                parse_int(item.get("quantity"))
                for item in holdings_docs
                if item.get("ticker") == req.symbol
                and (not req.exchange or item.get("exchange") == req.exchange)
            ),
            0,
        )
        if req.quantity > available_shares:
            raise HTTPException(status_code=400, detail="Not enough shares available to place sell limit order")

    now = utc_now_iso()
    document = {
        "uid": uid,
        "displayName": display_name,
        "symbol": req.symbol,
        "companyName": req.companyName or meta.get("companyName") or req.symbol,
        "exchange": req.exchange or meta.get("exchange") or live.get("exchange") or "",
        "side": side,
        "quantity": req.quantity,
        "limitPrice": round(float(req.limitPrice), 6),
        "currency": currency,
        "status": "pending",
        "lastCheckedPrice": current_price if current_price > 0 else None,
        "createdAt": now,
        "updatedAt": now,
    }
    result = limit_orders.insert_one(document)
    saved = limit_orders.find_one({"_id": result.inserted_id})
    return {"status": "ok", "data": normalize_limit_order(saved)}

@app.get("/prices/live")
def get_live_prices():
    live_data = list(live_prices.find({}, {"_id": 0}))
    symbols = [row.get("symbol") for row in live_data if row.get("symbol")]

    metadata_rows = list(
        metadata.find(
            {"ticker": {"$in": symbols}},
            {"_id": 0}
        )
    ) if symbols else []
    metadata_by_ticker = {row.get("ticker"): row for row in metadata_rows}

    try:
        rates_doc = get_usd_base_rates(allow_stale_fallback=True)
    except Exception:
        rates_doc = None

    enriched = []
    for row in live_data:
        symbol = row.get("symbol")
        meta = metadata_by_ticker.get(symbol, {})
        merged = {**row, **meta}
        currency = merged.get("currency") or "USD"
        if rates_doc is not None and merged.get("price") is not None:
            try:
                fx_rate = currency_to_usd_rate(currency, rates_doc)
                merged["fxRateToUsd"] = fx_rate
                merged["currentPriceUsd"] = round(parse_float(merged.get("price")) * fx_rate, 6)
            except Exception:
                merged["fxRateToUsd"] = None
                merged["currentPriceUsd"] = None
        enriched.append(merged)

    return enriched


@app.get("/stocks/search")
def search_stocks(exchange: Optional[str] = None, q: Optional[str] = None, limit: int = 50):
    query_filter = {}
    exchange_code = normalize_exchange(exchange)
    if exchange_code:
        query_filter["exchange"] = {"$regex": f"^{re.escape(exchange_code)}$", "$options": "i"}

    query_text = (q or "").strip()
    if query_text:
        escaped = re.escape(query_text)
        query_filter["$or"] = [
            {"ticker": {"$regex": escaped, "$options": "i"}},
            {"companyName": {"$regex": escaped, "$options": "i"}},
        ]

    safe_limit = max(1, min(limit, 200))
    metadata_rows = list(
        metadata.find(
            query_filter,
            {"_id": 0},
        )
        .sort("ticker", 1)
        .limit(safe_limit)
    )

    tickers = [row.get("ticker") for row in metadata_rows if row.get("ticker")]
    live_rows = (
        list(
            live_prices.find(
                {"symbol": {"$in": tickers}},
                {"_id": 0},
            )
        )
        if tickers
        else []
    )
    live_by_symbol = {row.get("symbol"): row for row in live_rows}

    try:
        rates_doc = get_usd_base_rates(allow_stale_fallback=True)
    except Exception:
        rates_doc = None

    enriched = []
    for row in metadata_rows:
        ticker = row.get("ticker")
        live = live_by_symbol.get(ticker, {})
        merged = {**live, **row}
        currency = merged.get("currency") or "USD"
        if rates_doc is not None and merged.get("price") is not None:
            try:
                fx_rate = currency_to_usd_rate(currency, rates_doc)
                merged["fxRateToUsd"] = fx_rate
                merged["currentPriceUsd"] = round(parse_float(merged.get("price")) * fx_rate, 6)
            except Exception:
                merged["fxRateToUsd"] = None
                merged["currentPriceUsd"] = None
        enriched.append(merged)

    return {"data": enriched}

@app.get("/market/state")
def get_market_state():
    return market_state.find_one({}, {"_id": 0})


@app.get("/simulation/status")
def get_simulation_status():
    state_doc = market_state.find_one({}, {"_id": 0}) or {}
    return {
        "enabled": is_price_ticker_running(),
        "enabledByDefault": ENABLE_PRICE_TICKER,
        "intervalSeconds": PRICE_TICK_INTERVAL_SECONDS,
        "marketState": state_doc,
    }


@app.post("/simulation/tick")
def run_simulation_tick():
    tick_summary = run_price_tick()
    order_summary = process_pending_limit_orders()
    return {"status": "ok", "data": tick_summary, "limitOrders": order_summary}


@app.post("/simulation/start")
async def start_simulation():
    started = start_price_ticker()
    return {
        "status": "ok",
        "enabled": is_price_ticker_running(),
        "started": started,
        "intervalSeconds": PRICE_TICK_INTERVAL_SECONDS,
    }


@app.post("/simulation/stop")
async def stop_simulation():
    stopped = stop_price_ticker()
    return {
        "status": "ok",
        "enabled": is_price_ticker_running(),
        "stopped": stopped,
        "intervalSeconds": PRICE_TICK_INTERVAL_SECONDS,
    }

@app.get("/prices/history/{symbol}")
def get_price_history(symbol: str):
    data = historical_prices.find(
        {"symbol": symbol},
        {"_id": 0}
    ).sort("timestamp", -1).limit(200)

    return list(data)

@app.get("/metadata/{symbol}")
def get_metadata(symbol: str):
    record = metadata.find_one({"ticker": symbol}, {"_id": 0})
    if not record:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "message": f"Metadata not found for {symbol}"}
        )
    return record

class TradeRequest(BaseModel):
    symbol: str
    exchange: str
    quantity: int


@app.post("/trade/buy")
def buy_trade(req: TradeRequest, current_user: dict = Depends(get_current_user)):
    display_name = get_user_display_name(current_user)
    try:
        trade = execute_trade(
            current_user["uid"],
            display_name,
            req.symbol,
            req.exchange,
            "BUY",
            req.quantity
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    portfolio_doc, holdings_docs = sync_portfolio_snapshot(current_user["uid"], display_name)
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "data": {
                "trade": trade,
                "portfolio": portfolio_doc,
                "holdings": holdings_docs,
            }
        }
    )


@app.post("/trade/sell")
def sell_trade(req: TradeRequest, current_user: dict = Depends(get_current_user)):
    display_name = get_user_display_name(current_user)
    try:
        trade = execute_trade(
            current_user["uid"],
            display_name,
            req.symbol,
            req.exchange,
            "SELL",
            req.quantity
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    portfolio_doc, holdings_docs = sync_portfolio_snapshot(current_user["uid"], display_name)
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "data": {
                "trade": trade,
                "portfolio": portfolio_doc,
                "holdings": holdings_docs,
            }
        }
    )


@app.post("/portfolio/reset")
def reset_portfolio(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    display_name = get_user_display_name(current_user)
    now = utc_now_iso()

    # Wipe all user data
    transactions.delete_many(get_user_transaction_query(uid))
    holdings.delete_many({"uid": uid})
    watchlists.delete_many({"uid": uid})
    limit_orders.delete_many({"uid": uid})

    # Reset portfolio to starting capital
    reset_doc = {
        "uid": uid,
        "displayName": display_name,
        "buyingPower": DEFAULT_STARTING_CAPITAL,
        "totalPortfolioValue": DEFAULT_STARTING_CAPITAL,
        "investmentValue": 0,
        "unrealisedPL": 0,
        "todaysPL": 0,
        "updatedAt": now,
    }
    portfolios.update_one(
        {"uid": uid},
        {"$set": reset_doc, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )

    return {"status": "ok", "data": reset_doc}


@app.get("/")
def root(request: Request):
    base = str(request.base_url).rstrip("/")
    return {
        "status": "Backend running",
        "docs": f"{base}/docs",
        "openapi": f"{base}/openapi.json"
    }
