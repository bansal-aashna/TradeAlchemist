import os
import sys
import unittest
from pathlib import Path


# Ensure `backend_api/` is importable as a top-level module directory.
BACKEND_API_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_API_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_API_DIR))


import fx_rates  # noqa: E402


class TestFxRates(unittest.TestCase):
    def test_inverts_usd_base_rate(self):
        # If API says 1 USD = 80 INR, then INR->USD = 1/80.
        rates_doc = {"rates": {"inr": 80.0}}
        self.assertAlmostEqual(fx_rates.currency_to_usd_rate("INR", rates_doc), 1.0 / 80.0, places=10)

    def test_usd_passthrough(self):
        rates_doc = {"rates": {"inr": 80.0}}
        self.assertEqual(fx_rates.currency_to_usd_rate("USD", rates_doc), 1.0)
        self.assertEqual(fx_rates.currency_to_usd_rate("", rates_doc), 1.0)

    def test_gbp_pence_scaling(self):
        # If API says 1 USD = 0.8 GBP, then GBP->USD = 1/0.8 = 1.25
        rates_doc = {"rates": {"gbp": 0.8}}
        self.assertAlmostEqual(fx_rates.currency_to_usd_rate("GBP", rates_doc), 1.25, places=10)
        # "GBp" is pence, i.e. GBP/100
        self.assertAlmostEqual(fx_rates.currency_to_usd_rate("GBp", rates_doc), 1.25 / 100.0, places=10)

    def test_missing_currency_rate_raises(self):
        rates_doc = {"rates": {"inr": 80.0}}
        with self.assertRaises(ValueError):
            fx_rates.currency_to_usd_rate("JPY", rates_doc)


if __name__ == "__main__":
    os.environ.setdefault("PYTHONHASHSEED", "0")
    unittest.main(verbosity=2)

