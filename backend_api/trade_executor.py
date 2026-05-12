from datetime import datetime, timezone

from db.mongo_client import limit_orders, live_prices, metadata, portfolios, transactions
from fx_rates import currency_to_usd_rate, get_usd_base_rates

COMMISSION_RATE = 0.002  # 0.2%
DEFAULT_STARTING_CAPITAL = 100000


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


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


def build_position_map(user_id):
    docs = list(
        transactions.find({"$or": [{"uid": user_id}, {"user_id": user_id}]}).sort("timestamp", 1)
    )

    positions = {}
    for document in docs:
        symbol = document.get("symbol") or document.get("ticker")
        exchange = document.get("exchange") or ""
        side = (document.get("side") or document.get("type") or "").upper()
        quantity = parse_int(document.get("quantity") or document.get("shares"))
        price = parse_float(document.get("priceUsd") or document.get("price_usd") or document.get("price"))

        if not symbol or quantity <= 0:
            continue

        key = (symbol, exchange)
        position = positions.setdefault(key, {"quantity": 0, "cost_basis": 0.0})

        if side == "BUY":
            position["quantity"] += quantity
            position["cost_basis"] += price * quantity
        elif side == "SELL":
            current_quantity = position["quantity"]
            average_price = (
                position["cost_basis"] / current_quantity if current_quantity > 0 else 0.0
            )
            sold_quantity = min(current_quantity, quantity)
            position["quantity"] = max(0, current_quantity - quantity)
            position["cost_basis"] = max(
                0.0,
                position["cost_basis"] - average_price * sold_quantity,
            )

    return positions


def execute_trade(user_id, display_name, symbol, exchange, side, quantity):
    if quantity < 1:
        raise ValueError("Quantity must be at least 1")

    live = live_prices.find_one({"symbol": symbol, "exchange": exchange}, {"_id": 0})
    if not live:
        live = live_prices.find_one({"symbol": symbol}, {"_id": 0})
    if not live:
        raise ValueError("Live price not available")

    price_native = parse_float(live.get("price"))
    if price_native <= 0:
        raise ValueError("Live price not available")

    meta = metadata.find_one({"ticker": symbol}, {"_id": 0}) or {}
    currency = meta.get("currency") or live.get("currency") or "USD"

    try:
        rates_doc = get_usd_base_rates()
        fx_rate_to_usd = currency_to_usd_rate(currency, rates_doc)
    except Exception as exc:
        raise ValueError(f"FX rate unavailable for {currency}→USD") from exc

    price_usd = round(price_native * fx_rate_to_usd, 6)
    gross_native = round(price_native * quantity, 2)
    gross_usd = round(price_usd * quantity, 2)
    commission_rate = 0.0
    commission_usd = 0.0
    net_usd = gross_usd

    portfolio = portfolios.find_one({"uid": user_id}, {"_id": 0}) or {
        "buyingPower": DEFAULT_STARTING_CAPITAL
    }
    buying_power = parse_float(portfolio.get("buyingPower"), DEFAULT_STARTING_CAPITAL)

    positions = build_position_map(user_id)
    available_shares = positions.get((symbol, exchange), {}).get("quantity", 0)
    if available_shares == 0 and exchange:
        available_shares = positions.get((symbol, ""), {}).get("quantity", 0)

    if side == "BUY":
        if gross_usd > buying_power:
            raise ValueError("Insufficient buying power")
        buying_power = round(buying_power - gross_usd, 2)
    elif side == "SELL":
        if quantity > available_shares:
            raise ValueError("Not enough shares available to sell")
        commission_rate = COMMISSION_RATE
        commission_usd = round(gross_usd * COMMISSION_RATE, 2)
        net_usd = round(gross_usd - commission_usd, 2)
        buying_power = round(buying_power + net_usd, 2)
    else:
        raise ValueError("Invalid trade side")

    transaction = {
        "uid": user_id,
        "user_id": user_id,
        "displayName": display_name,
        "symbol": symbol,
        "exchange": exchange or live.get("exchange") or "",
        "side": side,
        "quantity": quantity,
        # Back-compat fields (USD)
        "price": price_usd,
        "gross_value": gross_usd,
        "commission_rate": commission_rate,
        "commission_amount": commission_usd,
        "net_value": net_usd,
        # New fields
        "currency": currency,
        "fxRateToUsd": fx_rate_to_usd,
        "priceNative": price_native,
        "priceUsd": price_usd,
        "grossNative": gross_native,
        "grossUsd": gross_usd,
        "commissionUsd": commission_usd,
        "netUsd": net_usd,
        "timestamp": utc_now_iso(),
    }

    transactions.insert_one(transaction.copy())
    portfolios.update_one(
        {"uid": user_id},
        {
            "$set": {
                "displayName": display_name,
                "buyingPower": buying_power,
                "updatedAt": utc_now_iso(),
            },
            "$setOnInsert": {
                "uid": user_id,
                "createdAt": utc_now_iso(),
            },
        },
        upsert=True,
    )

    return transaction


def should_execute_limit_order(side, current_price, limit_price):
    if side == "BUY":
        return current_price <= limit_price
    if side == "SELL":
        return current_price >= limit_price
    return False


def process_pending_limit_orders():
    now = utc_now_iso()
    pending_orders = list(limit_orders.find({"status": "pending"}).sort("createdAt", 1))
    checked = 0
    executed = 0
    failed = 0

    for order in pending_orders:
        checked += 1
        symbol = order.get("symbol")
        exchange = order.get("exchange") or ""
        side = (order.get("side") or "").upper()
        quantity = parse_int(order.get("quantity"))
        limit_price = parse_float(order.get("limitPrice"))

        if not symbol or quantity <= 0 or limit_price <= 0 or side not in {"BUY", "SELL"}:
            limit_orders.update_one(
                {"_id": order["_id"]},
                {
                    "$set": {
                        "status": "failed",
                        "failureReason": "Invalid limit order",
                        "updatedAt": now,
                    }
                },
            )
            failed += 1
            continue

        live = live_prices.find_one({"symbol": symbol, "exchange": exchange}, {"_id": 0})
        if not live:
            live = live_prices.find_one({"symbol": symbol}, {"_id": 0})
        current_price = parse_float(live.get("price") if live else None)

        if current_price <= 0 or not should_execute_limit_order(side, current_price, limit_price):
            if current_price > 0:
                limit_orders.update_one(
                    {"_id": order["_id"]},
                    {"$set": {"lastCheckedPrice": current_price, "updatedAt": now}},
                )
            continue

        try:
            transaction = execute_trade(
                order["uid"],
                order.get("displayName") or order["uid"],
                symbol,
                exchange,
                side,
                quantity,
            )
            transactions.update_one(
                {
                    "uid": order["uid"],
                    "symbol": symbol,
                    "exchange": transaction.get("exchange") or exchange,
                    "timestamp": transaction.get("timestamp"),
                },
                {
                    "$set": {
                        "orderType": "limit",
                        "limitOrderId": str(order["_id"]),
                        "limitPrice": limit_price,
                    }
                },
            )
            limit_orders.update_one(
                {"_id": order["_id"]},
                {
                    "$set": {
                        "status": "executed",
                        "executedAt": transaction.get("timestamp") or now,
                        "executedPrice": transaction.get("priceNative"),
                        "executedPriceUsd": transaction.get("priceUsd"),
                        "lastCheckedPrice": current_price,
                        "updatedAt": now,
                    }
                },
            )
            executed += 1
        except Exception as exc:
            limit_orders.update_one(
                {"_id": order["_id"]},
                {
                    "$set": {
                        "status": "failed",
                        "failureReason": str(exc),
                        "lastCheckedPrice": current_price,
                        "updatedAt": now,
                    }
                },
            )
            failed += 1

    return {"checked": checked, "executed": executed, "failed": failed}
