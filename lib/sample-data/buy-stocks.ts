export type BuyStockSample = {
  symbol: string;
  companyName: string;
  exchange: string;
  currentPrice?: number;
  change?: number;
  percentChange?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prevClose?: number;
  volume?: number;
};

export const buyStocksSample: BuyStockSample[] = [
  {
    symbol: "RELIANCE",
    companyName: "Reliance Industries Ltd",
    exchange: "NSE",
    currentPrice: 1428.8,
    change: 0.8,
    percentChange: 0.06,
    open: 1425.3,
    high: 1433.3,
    low: 1415.0,
    close: 1428.0,
    prevClose: 1428.0,
    volume: 178539,
  },
  {
    symbol: "ASIANPAINT",
    companyName: "Asian Paints Ltd",
    exchange: "BSE",
    currentPrice: 2879.1,
    change: 105.7,
    percentChange: 3.81,
    open: 2765.0,
    high: 2889.4,
    low: 2748.2,
    close: 2879.1,
    prevClose: 2773.4,
    volume: 69044,
  },
  {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
    currentPrice: 191.45,
    change: -1.27,
    percentChange: -0.66,
    open: 193.2,
    high: 194.08,
    low: 190.72,
    close: 191.45,
    prevClose: 192.72,
    volume: 51234000,
  },
  {
    symbol: "HSBA",
    companyName: "HSBC Holdings",
    exchange: "London Stock Exchange",
    currentPrice: 6.42,
    change: 0.11,
    percentChange: 1.74,
    open: 6.29,
    high: 6.45,
    low: 6.28,
    close: 6.42,
    prevClose: 6.31,
    volume: 8201300,
  },
  {
    symbol: "7203",
    companyName: "Toyota Motor Corp.",
    exchange: "Tokyo Stock Exchange",
    currentPrice: 2880.0,
    change: 22.5,
    percentChange: 0.79,
    open: 2852.0,
    high: 2894.0,
    low: 2839.0,
    close: 2880.0,
    prevClose: 2857.5,
    volume: 3401200,
  },
];
