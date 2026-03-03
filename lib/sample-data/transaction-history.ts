import type { TransactionType } from "@/components/dashboard/transaction-history-table";

export type TransactionSample = {
  id: string;
  dateTime: string;
  ticker: string;
  company: string;
  type: TransactionType;
  shares: number;
  price: number;
};

export const transactionHistorySample: TransactionSample[] = [
  {
    id: "txn-001",
    dateTime: "2026-02-24T14:35:00Z",
    ticker: "AAPL",
    company: "Apple Inc.",
    type: "buy",
    shares: 20,
    price: 191.45,
  },
  {
    id: "txn-002",
    dateTime: "2026-02-24T16:10:00Z",
    ticker: "TSLA",
    company: "Tesla Inc.",
    type: "sell",
    shares: 8,
    price: 242.3,
  },
  {
    id: "txn-003",
    dateTime: "2026-02-25T10:05:00Z",
    ticker: "MSFT",
    company: "Microsoft Corp.",
    type: "buy",
    shares: 12,
    price: 415.9,
  },
  {
    id: "txn-004",
    dateTime: "2026-02-25T13:42:00Z",
    ticker: "NVDA",
    company: "NVIDIA Corp.",
    type: "sell",
    shares: 5,
    price: 682.15,
  },
  {
    id: "txn-005",
    dateTime: "2026-02-26T11:28:00Z",
    ticker: "AMZN",
    company: "Amazon.com Inc.",
    type: "buy",
    shares: 10,
    price: 174.62,
  },
];
