import React, { useMemo, useState } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";

type DonutChartProps = {
  holdings: PortfolioHolding[];
  groupBy?: "ticker" | "sector" | "classification";
};

const GREEN_PALETTE = [
  "#14532d",
  "#166534",
  "#15803d",
  "#16a34a",
  "#22c55e",
  "#4ade80",
  "#86efac",
  "#bbf7d0",
];

export function AssetAllocationDonut({ holdings, groupBy = "ticker" }: DonutChartProps) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const data = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    const grouped = new Map<string, { value: number; kind: "sector" | "industry" | "holding" }>();
    let totalValue = 0;

    holdings.forEach((holding) => {
      const value = (holding.quantity ?? 0) * (holding.currentPrice ?? 0);
      if (value <= 0) {
        return;
      }
      totalValue += value;
      const sector = holding.sector?.trim();
      const industry = holding.industry?.trim();
      const classificationLabel =
        sector || industry || "Unassigned";
      const kind =
        sector ? "sector" : industry ? "industry" : "holding";

      const label =
        groupBy === "sector"
          ? sector || "Unassigned"
          : groupBy === "classification"
            ? classificationLabel
            : holding.ticker;

      const existing = grouped.get(label);
      grouped.set(label, {
        value: (existing?.value ?? 0) + value,
        kind: existing?.kind ?? kind,
      });
    });

    const items = Array.from(grouped.entries())
      .map(([label, meta]) => ({ label, value: meta.value, kind: meta.kind }))
      .filter((item) => item.value > 0);

    if (totalValue === 0) return [];

    items.sort((a, b) => b.value - a.value);

    let offset = 25;
    return items.map((item, index) => {
      const percent = (item.value / totalValue) * 100;
      const strokeDashoffset = 100 - offset + 25;
      offset += percent;
      
      return {
        ...item,
        percent,
        color: GREEN_PALETTE[index % GREEN_PALETTE.length],
        offset: strokeDashoffset
      };
    });
  }, [groupBy, holdings]);

  const hoveredSlice = hoveredLabel
    ? data.find((slice) => slice.label === hoveredLabel) ?? null
    : null;

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
              key={slice.label}
              cx="21"
              cy="21"
              r="15.91549431"
              fill="transparent"
              stroke={slice.color}
              strokeWidth="6"
              strokeDasharray={`${slice.percent} ${100 - slice.percent}`}
              strokeDashoffset={slice.offset}
              className="ta-donut-segment"
              onMouseEnter={() => setHoveredLabel(slice.label)}
              onMouseLeave={() => setHoveredLabel(null)}
            />
          ))}
        </svg>
        {hoveredSlice ? (
          <div className="ta-donut-center-label">
            <p className="ta-donut-center-kind">
              {hoveredSlice.kind === "sector"
                ? "Sector"
                : hoveredSlice.kind === "industry"
                  ? "Industry"
                  : "Holding"}
            </p>
            <p className="ta-donut-center-name">{hoveredSlice.label}</p>
            <p className="ta-donut-center-value">{hoveredSlice.percent.toFixed(1)}%</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
