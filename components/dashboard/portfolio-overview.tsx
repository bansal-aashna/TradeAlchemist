import { memo } from "react";
import type { TradeDraft } from "@/components/dashboard/trade-modal";
import type { TradeDrawerStock } from "@/components/dashboard/trade-drawer";
import { AssetAllocationDonut } from "./donut-chart";

export type PortfolioMetrics = {
  totalPortfolioValue?: number;
  investmentValue?: number;
  unrealisedPL?: number;
  todaysPL?: number;
  buyingPower?: number;
};

export type PortfolioHolding = {
  ticker: string;
  companyName?: string;
  exchange?: string;
  displayName?: string;
  quantity?: number;
  currentPrice?: number;
  holdPrice?: number;
  totalPL?: number;
};

type PortfolioOverviewProps = {
  metrics?: PortfolioMetrics;
  holdings?: PortfolioHolding[];
  onTradeAction: (trade: TradeDraft) => void;
  onRowClick?: (stock: TradeDrawerStock) => void;
  onOpenBuyStock?: (stock: TradeDrawerStock) => void;
};

const portfolioFields: Array<{ key: keyof PortfolioMetrics; label: string }> = [
  { key: "totalPortfolioValue", label: "Total Portfolio Value" },
  { key: "investmentValue", label: "Investment Value" },
  { key: "unrealisedPL", label: "Unrealised P/L" },
  { key: "todaysPL", label: "Today's P/L" },
  { key: "buyingPower", label: "Buying Power" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function getValueTone(value: number | undefined) {
  if (value === undefined) {
    return "neutral";
  }
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

export const PortfolioOverview = memo(function PortfolioOverview({
  metrics,
  holdings,
  onTradeAction,
  onRowClick,
  onOpenBuyStock,
}: PortfolioOverviewProps) {
  return (
    <section className="ta-dashboard-content">
      <h2 className="ta-holdings-title">Portfolio</h2>

      <div className="ta-portfolio-grid">
        {portfolioFields.map((field) => {
          const value = metrics?.[field.key];
          const tone = getValueTone(value);
          const displayValue = value === undefined ? "--" : formatCurrency(value);

          return (
            <article key={field.key} className="ta-portfolio-card">
              <p className="ta-portfolio-label">{field.label}</p>
              <p className={`ta-portfolio-value ${tone}`}>{displayValue}</p>
            </article>
          );
        })}
      </div>

      <div className="ta-holdings-wrap">
        <h3 className="ta-holdings-title">Asset Allocation</h3>
        <article className="ta-dashboard-section-card">
          <AssetAllocationDonut holdings={holdings ?? []} />
        </article>
      </div>

      <div className="ta-holdings-wrap">
        <h3 className="ta-holdings-title">All Holdings</h3>
        <div className="ta-holdings-table-wrap">
          <table className="ta-holdings-table">
            <thead>
              <tr>
                <th>Stock</th>
                <th className="ta-th-light">Current Price</th>
                <th className="ta-th-light">Hold Price</th>
                <th className="ta-th-light">Total P/L</th>
                <th className="ta-th-light">Sell</th>
              </tr>
            </thead>
            <tbody>
              {holdings && holdings.length > 0 ? (
                holdings.map((holding) => {
                  const plTone = getValueTone(holding.totalPL);
                  return (
                      <tr
                        key={holding.ticker}
                        className="ta-clickable-row"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          onRowClick?.({
                            ticker: holding.ticker,
                            companyName: holding.companyName ?? holding.ticker,
                            exchange: holding.exchange ?? "",
                            currentPrice: holding.currentPrice,
                            initialTradeMode: "sell",
                          });
                        }}
                      >
                      <td>
                        <button
                          type="button"
                          className="ta-stock-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenBuyStock?.({
                              ticker: holding.ticker,
                              companyName: holding.companyName ?? holding.ticker,
                              exchange: holding.exchange ?? "",
                              currentPrice: holding.currentPrice,
                            });
                          }}
                        >
                          <p className="ta-holding-ticker">{holding.ticker}</p>
                        </button>
                        <p className="ta-holding-qty">Qty: {holding.quantity ?? "--"}</p>
                      </td>
                      <td>{holding.currentPrice === undefined ? "--" : formatCurrency(holding.currentPrice)}</td>
                      <td>{holding.holdPrice === undefined ? "--" : formatCurrency(holding.holdPrice)}</td>
                      <td className={`ta-portfolio-value ${plTone}`}>
                        {holding.totalPL === undefined ? "--" : formatCurrency(holding.totalPL)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ta-type-pill ta-type-pill-btn sell ta-sell-pill-btn"
                          disabled={!holding.currentPrice || !holding.quantity}
                          onClick={() => {
                            if (!holding.currentPrice || !holding.quantity) {
                              return;
                            }
                            onTradeAction({
                              ticker: holding.ticker,
                              company: holding.companyName ?? holding.ticker,
                              exchange: holding.exchange,
                              price: holding.currentPrice,
                              type: "sell",
                              maxShares: holding.quantity,
                            });
                          }}
                        >
                          Sell
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="ta-holdings-empty">
                    Holdings will appear once trading data is connected. When backend is ready, pass a real holdings array and values will render automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
});
