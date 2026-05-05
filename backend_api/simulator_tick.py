import math
import os
import random
import threading
from datetime import datetime, timezone

from pymongo import InsertOne, UpdateOne

from db.mongo_client import historical_prices, live_prices, market_state, metadata


def _getenv_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _getenv_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def _getenv_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw.strip())
    except ValueError:
        return default


SIM_USE_LOG_RETURNS = _getenv_bool("SIM_USE_LOG_RETURNS", True)
SIM_MARKET_SIGMA = _getenv_float("SIM_MARKET_SIGMA", 0.0025)
SIM_SECTOR_SIGMA = _getenv_float("SIM_SECTOR_SIGMA", 0.0015)
SIM_BETA_MARKET_DEFAULT = _getenv_float("SIM_BETA_MARKET_DEFAULT", 1.0)
SIM_BETA_SECTOR_DEFAULT = _getenv_float("SIM_BETA_SECTOR_DEFAULT", 0.8)
SIM_EWMA_LAMBDA = _getenv_float("SIM_EWMA_LAMBDA", 0.94)
SIM_MAX_ABS_RETURN = _getenv_float("SIM_MAX_ABS_RETURN", 0.12)  # 12% max per tick
SIM_PRICE_FLOOR = _getenv_float("SIM_PRICE_FLOOR", 0.05)
SIM_VOLUME_SENSITIVITY = _getenv_float("SIM_VOLUME_SENSITIVITY", 6.0)
SIM_REGIME_COOLDOWN_TICKS = _getenv_int("SIM_REGIME_COOLDOWN_TICKS", 5)
SIM_DRIFT_PER_TICK = _getenv_float("SIM_DRIFT_PER_TICK", 0.0)
SIM_IDIO_SHARE = _getenv_float("SIM_IDIO_SHARE", 0.65)

_seed = os.getenv("SIM_SEED")
if _seed is not None and _seed.strip():
    try:
        random.seed(int(_seed.strip()))
    except ValueError:
        # If user passes a non-int seed, fall back to hashing the string.
        random.seed(_seed.strip())


BASE_MOVE = 0.001
VOLUME_RANGE = (1000, 10000)

CRASH_PROB = 0.002
BOOM_PROB = 0.003

CRASH_MULTIPLIER = 2.5
BOOM_MULTIPLIER = 1.5

CRASH_BIAS = -0.002
BOOM_BIAS = 0.0015

MOMENTUM_FACTOR = 0.3
PRICE_TICK_LOCK = threading.Lock()


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def ewma_update(prev_var: float, prev_return: float, lambda_: float) -> float:
    lambda_clamped = clamp(lambda_, 0.0, 0.9999)
    prev_var = max(0.0, float(prev_var))
    prev_return = float(prev_return)
    return lambda_clamped * prev_var + (1.0 - lambda_clamped) * (prev_return**2)


def price_from_return(old_price: float, log_return: float) -> float:
    if SIM_USE_LOG_RETURNS:
        return old_price * math.exp(log_return)
    return old_price * (1.0 + log_return)


def _load_market_regime():
    state_doc = market_state.find_one({}) or {}
    state = state_doc.get("state", "NORMAL")
    remaining = int(state_doc.get("remaining_ticks", 0) or 0)
    cooldown = int(state_doc.get("cooldown_ticks", 0) or 0)

    if remaining > 0:
        return state, remaining, cooldown

    # If the last regime just ended, prevent immediate re-triggering.
    if cooldown > 0:
        return "NORMAL", 0, cooldown

    roll = random.random()
    if roll < CRASH_PROB:
        return "CRASH", random.randint(5, 15), SIM_REGIME_COOLDOWN_TICKS
    if roll < CRASH_PROB + BOOM_PROB:
        return "BOOM", random.randint(5, 10), SIM_REGIME_COOLDOWN_TICKS
    return "NORMAL", 0, 0


def _get_regime_params(state):
    if state == "CRASH":
        return CRASH_MULTIPLIER, CRASH_BIAS
    if state == "BOOM":
        return BOOM_MULTIPLIER, BOOM_BIAS
    return 1.0, 0.0


def _get_metadata_by_symbol(symbols):
    if not symbols:
        return {}

    rows = metadata.find(
        {"ticker": {"$in": symbols}},
        {
            "_id": 0,
            "ticker": 1,
            "symbol": 1,
            "exchange": 1,
            "avgVolatility": 1,
            "sector": 1,
            "betaMarket": 1,
            "betaSector": 1,
        },
    )

    by_symbol = {}
    for row in rows:
        key = row.get("ticker") or row.get("symbol")
        if key:
            by_symbol[key] = row
    return by_symbol


def run_price_tick():
    if not PRICE_TICK_LOCK.acquire(blocking=False):
        state_doc = market_state.find_one({}, {"_id": 0}) or {}
        return {
            "updated": 0,
            "state": state_doc.get("state", "NORMAL"),
            "remaining_ticks": state_doc.get("remaining_ticks", 0),
            "last_tick_at": state_doc.get("last_tick_at"),
            "skipped": True,
            "reason": "tick already running",
        }

    try:
        tick_time = datetime.now(timezone.utc)
        state, remaining, cooldown = _load_market_regime()
        regime_multiplier, regime_bias = _get_regime_params(state)
        stocks = list(live_prices.find({}))
        metadata_by_symbol = _get_metadata_by_symbol(
            [stock.get("symbol") for stock in stocks if stock.get("symbol")]
        )

        # Correlated factors: one market shock and one shock per sector.
        market_shock = random.gauss(0.0, SIM_MARKET_SIGMA)
        sectors = set()
        for stock in stocks:
            symbol = stock.get("symbol")
            if not symbol:
                continue
            meta = metadata_by_symbol.get(symbol, {})
            sector = meta.get("sector") or "UNKNOWN"
            sectors.add(sector)
        sector_shocks = {sector: random.gauss(0.0, SIM_SECTOR_SIGMA) for sector in sectors}

        live_updates = []
        history_inserts = []

        for stock in stocks:
            symbol = stock.get("symbol")
            exchange = stock.get("exchange")
            old_price = stock.get("price")

            if not symbol or not exchange or old_price is None or old_price <= 0:
                continue

            meta = metadata_by_symbol.get(symbol, {})
            sector = meta.get("sector") or "UNKNOWN"
            volatility = float(meta.get("avgVolatility", 1.0) or 1.0)

            beta_market = meta.get("betaMarket")
            beta_sector = meta.get("betaSector")
            try:
                beta_market = float(beta_market) if beta_market is not None else SIM_BETA_MARKET_DEFAULT
            except (TypeError, ValueError):
                beta_market = SIM_BETA_MARKET_DEFAULT
            try:
                beta_sector = float(beta_sector) if beta_sector is not None else SIM_BETA_SECTOR_DEFAULT
            except (TypeError, ValueError):
                beta_sector = SIM_BETA_SECTOR_DEFAULT

            # Base per-tick volatility from metadata, amplified by regime.
            base_sigma = BASE_MOVE * volatility * regime_multiplier
            base_sigma = max(0.0, float(base_sigma))

            prev_log_return = stock.get("sim_prev_log_return")
            try:
                prev_log_return = float(prev_log_return) if prev_log_return is not None else 0.0
            except (TypeError, ValueError):
                prev_log_return = 0.0

            prev_ewma_var = stock.get("sim_ewma_var")
            try:
                prev_ewma_var = float(prev_ewma_var) if prev_ewma_var is not None else (base_sigma**2)
            except (TypeError, ValueError):
                prev_ewma_var = base_sigma**2

            # Volatility clustering: update variance using last return and scale current sigma.
            ewma_var = ewma_update(prev_ewma_var, prev_log_return, SIM_EWMA_LAMBDA)
            clustered_sigma = math.sqrt(ewma_var) if ewma_var > 0 else 0.0

            # Decompose volatility into correlated and idiosyncratic components.
            idio_sigma = clustered_sigma * clamp(SIM_IDIO_SHARE, 0.05, 0.95)
            idio_sigma = max(0.0, float(idio_sigma))
            idio_shock = random.gauss(0.0, 1.0)

            # Momentum uses previous log return to avoid compounding on price scale.
            momentum = MOMENTUM_FACTOR * prev_log_return

            log_return = (
                SIM_DRIFT_PER_TICK
                + regime_bias
                + momentum
                + (beta_market * market_shock)
                + (beta_sector * sector_shocks.get(sector, 0.0))
                + (idio_sigma * idio_shock)
            )

            log_return = clamp(float(log_return), -abs(SIM_MAX_ABS_RETURN), abs(SIM_MAX_ABS_RETURN))
            new_price_raw = price_from_return(float(old_price), log_return)
            new_price_raw = max(float(SIM_PRICE_FLOOR), float(new_price_raw))
            new_price = round(new_price_raw, 2)

            if new_price <= 0:
                continue

            candle_high = max(old_price, new_price)
            candle_low = min(old_price, new_price)
            base_volume = random.randint(*VOLUME_RANGE)
            volume_multiplier = 1.0 + clamp(SIM_VOLUME_SENSITIVITY, 0.0, 25.0) * abs(log_return)
            volume = int(clamp(base_volume * volume_multiplier, VOLUME_RANGE[0], VOLUME_RANGE[1]))
            change = round(new_price - old_price, 2)
            percent_change = round((change / old_price) * 100, 4)

            live_updates.append(
                UpdateOne(
                    {"_id": stock["_id"]},
                    {
                        "$set": {
                            "price": new_price,
                            "prev_price": old_price,
                            "prevClose": old_price,
                            "open": old_price,
                            "high": candle_high,
                            "low": candle_low,
                            "close": new_price,
                            "volume": volume,
                            "change": change,
                            "percentChange": percent_change,
                            "last_update": tick_time,
                            "source": f"simulation_v4_{state.lower()}",
                            "sim_prev_log_return": log_return,
                            "sim_ewma_var": ewma_var,
                        }
                    },
                )
            )

            history_inserts.append(
                InsertOne(
                    {
                        "symbol": symbol,
                        "exchange": exchange,
                        "timestamp": tick_time,
                        "open": old_price,
                        "high": candle_high,
                        "low": candle_low,
                        "close": new_price,
                        "volume": volume,
                    }
                )
            )

        if live_updates:
            live_prices.bulk_write(live_updates, ordered=False)
        if history_inserts:
            historical_prices.bulk_write(history_inserts, ordered=False)

        updated = len(live_updates)
        next_remaining = max(remaining - 1, 0)
        next_cooldown = cooldown
        if remaining > 0 and next_remaining == 0 and cooldown <= 0 and state in {"CRASH", "BOOM"}:
            next_cooldown = SIM_REGIME_COOLDOWN_TICKS
        elif remaining <= 0 and cooldown > 0:
            next_cooldown = max(cooldown - 1, 0)

        market_state.update_one(
            {},
            {
                "$set": {
                    "state": state,
                    "remaining_ticks": next_remaining,
                    "started_at": tick_time,
                    "last_tick_at": tick_time,
                    "last_tick_updated": updated,
                    "cooldown_ticks": next_cooldown,
                }
            },
            upsert=True,
        )

        return {
            "updated": updated,
            "state": state,
            "remaining_ticks": next_remaining,
            "last_tick_at": tick_time.isoformat(),
            "skipped": False,
        }
    finally:
        PRICE_TICK_LOCK.release()
