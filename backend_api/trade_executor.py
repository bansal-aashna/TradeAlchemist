from datetime import datetime, timezone
from typing import Optional

from db.mongo_client import live_prices, orders, portfolios, transactions

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
        price = parse_float(document.get("price"))

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


def execute_trade(
    user_id,
    display_name,
    symbol,
    exchange,
    side,
    quantity,
    execution_price: Optional[float] = None,
    order_type: str = "MARKET",
    limit_price: Optional[float] = None,
    source_order_id: Optional[str] = None,
):
    if quantity < 1:
        raise ValueError("Quantity must be at least 1")

    live = live_prices.find_one({"symbol": symbol, "exchange": exchange}, {"_id": 0})
    if not live:
        live = live_prices.find_one({"symbol": symbol}, {"_id": 0})
    if not live:
        raise ValueError("Live price not available")

    price = parse_float(execution_price if execution_price is not None else live.get("price"))
    if price <= 0:
        raise ValueError("Live price not available")

    gross_value = round(price * quantity, 2)
    commission_rate = 0.0
    commission_amount = 0.0
    net_value = gross_value

    portfolio = portfolios.find_one({"uid": user_id}, {"_id": 0}) or {
        "buyingPower": DEFAULT_STARTING_CAPITAL
    }
    buying_power = parse_float(portfolio.get("buyingPower"), DEFAULT_STARTING_CAPITAL)

    positions = build_position_map(user_id)
    available_shares = positions.get((symbol, exchange), {}).get("quantity", 0)
    if available_shares == 0 and exchange:
        available_shares = positions.get((symbol, ""), {}).get("quantity", 0)

    if side == "BUY":
        if gross_value > buying_power:
            raise ValueError("Insufficient buying power")
        buying_power = round(buying_power - gross_value, 2)
    elif side == "SELL":
        if quantity > available_shares:
            raise ValueError("Not enough shares available to sell")
        commission_rate = COMMISSION_RATE
        commission_amount = round(gross_value * COMMISSION_RATE, 2)
        net_value = round(gross_value - commission_amount, 2)
        buying_power = round(buying_power + net_value, 2)
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
        "price": price,
        "gross_value": gross_value,
        "commission_rate": commission_rate,
        "commission_amount": commission_amount,
        "net_value": net_value,
        "order_type": order_type,
        "limit_price": limit_price,
        "source_order_id": source_order_id,
        "timestamp": utc_now_iso(),
    }

    inserted = transactions.insert_one(transaction.copy())
    transaction["_id"] = str(inserted.inserted_id)
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


def _limit_condition_met(side: str, current_price: float, limit_price: float) -> bool:
    if side == "BUY":
        return current_price <= limit_price
    if side == "SELL":
        return current_price >= limit_price
    return False


def place_limit_order(user_id, display_name, symbol, exchange, side, quantity, limit_price):
    if quantity < 1:
        raise ValueError("Quantity must be at least 1")

    limit_price = parse_float(limit_price)
    if limit_price <= 0:
        raise ValueError("Limit price must be greater than 0")

    live = live_prices.find_one({"symbol": symbol, "exchange": exchange}, {"_id": 0})
    if not live:
        live = live_prices.find_one({"symbol": symbol}, {"_id": 0})
    if not live:
        raise ValueError("Live price not available")

    current_price = parse_float(live.get("price"))
    if current_price <= 0:
        raise ValueError("Live price not available")

    if _limit_condition_met(side, current_price, limit_price):
        trade = execute_trade(
            user_id,
            display_name,
            symbol,
            exchange,
            side,
            quantity,
            execution_price=current_price,
            order_type="LIMIT",
            limit_price=limit_price,
        )
        return {"executed": True, "trade": trade, "order": None}

    if side == "BUY":
        portfolio = portfolios.find_one({"uid": user_id}, {"_id": 0}) or {
            "buyingPower": DEFAULT_STARTING_CAPITAL
        }
        buying_power = parse_float(portfolio.get("buyingPower"), DEFAULT_STARTING_CAPITAL)
        if round(limit_price * quantity, 2) > buying_power:
            raise ValueError("Insufficient buying power for this limit order")
    elif side == "SELL":
        positions = build_position_map(user_id)
        available_shares = positions.get((symbol, exchange), {}).get("quantity", 0)
        if available_shares == 0 and exchange:
            available_shares = positions.get((symbol, ""), {}).get("quantity", 0)
        if quantity > available_shares:
            raise ValueError("Not enough shares available to sell")

    order = {
        "uid": user_id,
        "user_id": user_id,
        "displayName": display_name,
        "symbol": symbol,
        "exchange": exchange or live.get("exchange") or "",
        "side": side,
        "quantity": quantity,
        "order_type": "LIMIT",
        "limit_price": round(limit_price, 2),
        "status": "PENDING",
        "createdAt": utc_now_iso(),
        "updatedAt": utc_now_iso(),
    }
    inserted = orders.insert_one(order.copy())
    order["_id"] = str(inserted.inserted_id)
    return {"executed": False, "trade": None, "order": order}


def process_limit_orders():
    pending_orders = list(orders.find({"status": "PENDING"}).sort("createdAt", 1).limit(500))
    if not pending_orders:
        return {"checked": 0, "filled": 0, "rejected": 0}

    filled = 0
    rejected = 0
    for order in pending_orders:
        symbol = order.get("symbol")
        exchange = order.get("exchange") or ""
        side = (order.get("side") or "").upper()
        quantity = parse_int(order.get("quantity"))
        limit_price = parse_float(order.get("limit_price"))
        if not symbol or quantity <= 0 or limit_price <= 0 or side not in {"BUY", "SELL"}:
            orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"status": "REJECTED", "reason": "Invalid order payload", "updatedAt": utc_now_iso()}},
            )
            rejected += 1
            continue

        live = live_prices.find_one({"symbol": symbol, "exchange": exchange}, {"_id": 0})
        if not live:
            live = live_prices.find_one({"symbol": symbol}, {"_id": 0})
        current_price = parse_float(live.get("price") if live else None)
        if current_price <= 0:
            continue

        if not _limit_condition_met(side, current_price, limit_price):
            continue

        try:
            trade = execute_trade(
                order.get("uid"),
                order.get("displayName") or order.get("uid"),
                symbol,
                exchange,
                side,
                quantity,
                execution_price=current_price,
                order_type="LIMIT",
                limit_price=limit_price,
                source_order_id=str(order.get("_id")),
            )
            orders.update_one(
                {"_id": order["_id"]},
                {
                    "$set": {
                        "status": "FILLED",
                        "filledAt": utc_now_iso(),
                        "filledPrice": current_price,
                        "updatedAt": utc_now_iso(),
                        "tradeId": trade.get("_id"),
                    }
                },
            )
            filled += 1
        except ValueError as exc:
            orders.update_one(
                {"_id": order["_id"]},
                {
                    "$set": {
                        "status": "REJECTED",
                        "reason": str(exc),
                        "updatedAt": utc_now_iso(),
                    }
                },
            )
            rejected += 1

    return {"checked": len(pending_orders), "filled": filled, "rejected": rejected}
