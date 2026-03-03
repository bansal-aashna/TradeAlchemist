import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";

export const holdingsSample: PortfolioHolding[] = [
  {
    ticker: "RELIANCE",
    quantity: 120,
    currentPrice: 1428.8,
    holdPrice: 1380.25,
    totalPL: 5826,
  },
  {
    ticker: "ASIANPAINT",
    quantity: 35,
    currentPrice: 2879.1,
    holdPrice: 3010.6,
    totalPL: -4602.5,
  },
  {
    ticker: "AAPL",
    quantity: 48,
    currentPrice: 191.45,
    holdPrice: 175.8,
    totalPL: 751.2,
  },
  {
    ticker: "TSLA",
    quantity: 15,
    currentPrice: 242.3,
    holdPrice: 268.4,
    totalPL: -391.5,
  },
  {
    ticker: "MSFT",
    quantity: 22,
    currentPrice: 415.9,
    holdPrice: 398.1,
    totalPL: 391.6,
  },
];
