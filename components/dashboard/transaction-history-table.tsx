import { memo } from "react";
import type { TradeDrawerStock } from "@/components/dashboard/trade-drawer";

export type TransactionType = "buy" | "sell";

export type TransactionRecord = {
  id: string;
  dateTime: string;
  ticker: string;
  company: string;
  exchange?: string;
  type: TransactionType;
  shares: number;
  price: number;
  realisedPL?: number;
};

type TransactionHistoryTableProps = {
  transactions: TransactionRecord[];
  onRowClick?: (stock: TradeDrawerStock) => void;
  onOpenBuyStock?: (stock: TradeDrawerStock) => void;
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export const TransactionHistoryTable = memo(function TransactionHistoryTable({
  transactions,
  onRowClick,
  onOpenBuyStock,
}: TransactionHistoryTableProps) {
  return (
    <section className="ta-dashboard-content">
      <h2 className="ta-holdings-title">Transaction History</h2>
      <div className="ta-holdings-table-wrap">
        <table className="ta-holdings-table">
          <thead>
            <tr>
              <th>Date time</th>
              <th>Ticker</th>
              <th>Company</th>
              <th>Type</th>
              <th>Shares</th>
              <th>Price</th>
              <th>Total Value</th>
              <th>Profit / Loss</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length > 0 ? (
              transactions.map((transaction) => {
                const totalValue = transaction.shares * transaction.price;

                return (
                  <tr
                    key={transaction.id}
                    className="ta-clickable-row"
                    onClick={() => onRowClick?.({ ticker: transaction.ticker, companyName: transaction.company, exchange: "", currentPrice: transaction.price })}
                  >
                    <td>{formatDateTime(transaction.dateTime)}</td>
                    <td>
                      <button
                        type="button"
                        className="ta-stock-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenBuyStock?.({
                            ticker: transaction.ticker,
                            companyName: transaction.company,
                            exchange: transaction.exchange ?? "",
                            currentPrice: transaction.price,
                          });
                        }}
                      >
                        <p className="ta-holding-ticker">{transaction.ticker}</p>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ta-stock-link ta-stock-link-muted"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenBuyStock?.({
                            ticker: transaction.ticker,
                            companyName: transaction.company,
                            exchange: transaction.exchange ?? "",
                            currentPrice: transaction.price,
                          });
                        }}
                      >
                        <p className="ta-stock-company">{transaction.company}</p>
                      </button>
                    </td>
                    <td>
                      <span className={`ta-type-pill ${transaction.type}`}>
                        {transaction.type.toUpperCase()}
                      </span>
                    </td>
                    <td>{transaction.shares}</td>
                    <td>{formatCurrency(transaction.price)}</td>
                    <td>{formatCurrency(totalValue)}</td>
                    <td className={`ta-portfolio-value ${transaction.realisedPL !== undefined && transaction.realisedPL !== 0 ? (transaction.realisedPL > 0 ? 'positive' : 'negative') : 'neutral'}`}>
                      {transaction.type === 'buy' ? '--' : (transaction.realisedPL !== undefined ? formatCurrency(transaction.realisedPL) : '--')}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="ta-holdings-empty">
                  No transactions available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});
