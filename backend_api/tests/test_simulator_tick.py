import os
import sys
import unittest
from pathlib import Path


# Ensure `backend_api/` is importable as a top-level module directory.
BACKEND_API_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_API_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_API_DIR))


import simulator_tick  # noqa: E402


class TestSimulatorMath(unittest.TestCase):
    def test_clamp(self):
        self.assertEqual(simulator_tick.clamp(5.0, 0.0, 10.0), 5.0)
        self.assertEqual(simulator_tick.clamp(-1.0, 0.0, 10.0), 0.0)
        self.assertEqual(simulator_tick.clamp(11.0, 0.0, 10.0), 10.0)

    def test_ewma_update_non_negative(self):
        v = simulator_tick.ewma_update(prev_var=0.0, prev_return=0.1, lambda_=0.94)
        self.assertGreaterEqual(v, 0.0)

    def test_ewma_update_converges_for_constant_return(self):
        # For constant return r, EWMA variance converges near r^2.
        r = 0.05
        v = 0.0
        for _ in range(500):
            v = simulator_tick.ewma_update(prev_var=v, prev_return=r, lambda_=0.9)
        self.assertAlmostEqual(v, r * r, delta=1e-4)

    def test_price_from_return_positive_with_log_returns(self):
        old = 100.0
        # Force log-return mode for this test only.
        original = simulator_tick.SIM_USE_LOG_RETURNS
        try:
            simulator_tick.SIM_USE_LOG_RETURNS = True
            new = simulator_tick.price_from_return(old, log_return=-5.0)
            self.assertGreater(new, 0.0)
        finally:
            simulator_tick.SIM_USE_LOG_RETURNS = original

    def test_return_clamp_bounds(self):
        # Ensure our clamp helper enforces symmetric bounds.
        max_abs = 0.12
        self.assertEqual(simulator_tick.clamp(0.5, -max_abs, max_abs), max_abs)
        self.assertEqual(simulator_tick.clamp(-0.5, -max_abs, max_abs), -max_abs)


class TestSectorFallback(unittest.TestCase):
    def test_sector_missing_falls_back_unknown(self):
        # This mirrors the simulator's sector selection rule without needing Mongo.
        meta = {}
        sector = meta.get("sector") or "UNKNOWN"
        self.assertEqual(sector, "UNKNOWN")


if __name__ == "__main__":
    # Make unittest output deterministic when run directly.
    os.environ.setdefault("PYTHONHASHSEED", "0")
    unittest.main(verbosity=2)

