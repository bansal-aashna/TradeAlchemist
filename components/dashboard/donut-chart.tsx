import React, { useMemo } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";

type DonutChartProps = {
  holdings: PortfolioHolding[];
};

const COLORS = [
  "#1a73e8", "#34a853", "#fbbc04", "#ea4335",
  "#673ab7", "#ff6d00", "#00bcd4", "#e91e63",
  "#9c27b0", "#3f51b5", "#009688", "#cddc39"
];

export function AssetAllocationDonut({ holdings }: DonutChartProps) {
  const data = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    let totalValue = 0;
    const items = holdings.map((h) => {
      const value = (h.quantity ?? 0) * (h.currentPrice ?? 0);
      totalValue += value;
      return { ticker: h.ticker, value };
    }).filter(h => h.value > 0);

    if (totalValue === 0) return [];

    // Sort by value descending
    items.sort((a, b) => b.value - a.value);

    let offset = 25; // start at top
    return items.map((item, index) => {
      const percent = (item.value / totalValue) * 100;
      const strokeDashoffset = 100 - offset + 25;
      offset += percent;
      
      return {
        ...item,
        percent,
        color: COLORS[index % COLORS.length],
        offset: strokeDashoffset
      };
    });
  }, [holdings]);

  if (data.length === 0) {
    return (
      <div className="ta-donut-empty">
        <p>No asset allocation data available.</p>
      </div>
    );
  }

  return (
    <div className="ta-donut-container">
      <div className="ta-donut-chart">
        <svg viewBox="0 0 42 42" className="ta-donut-svg">
          <circle cx="21" cy="21" r="15.91549431" fill="transparent" stroke="var(--border-light)" strokeWidth="6" />
          {data.map((slice) => (
            <circle
              key={slice.ticker}
              cx="21"
              cy="21"
              r="15.91549431"
              fill="transparent"
              stroke={slice.color}
              strokeWidth="6"
              strokeDasharray={`${slice.percent} ${100 - slice.percent}`}
              strokeDashoffset={slice.offset}
              className="ta-donut-segment"
            />
          ))}
        </svg>
      </div>
      <div className="ta-donut-legend">
        {data.slice(0, 6).map((slice) => (
          <div key={slice.ticker} className="ta-donut-legend-item">
            <span className="ta-donut-legend-color" style={{ backgroundColor: slice.color }}></span>
            <span className="ta-donut-legend-label">{slice.ticker}</span>
            <span className="ta-donut-legend-value">{slice.percent.toFixed(1)}%</span>
          </div>
        ))}
        {data.length > 6 && (
          <div className="ta-donut-legend-item">
            <span className="ta-donut-legend-label">Other...</span>
          </div>
        )}
      </div>
    </div>
  );
}
