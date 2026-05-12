"use client";

import { memo, useMemo, useState } from "react";
import type { PortfolioHolding } from "@/components/dashboard/portfolio-overview";

type AllocationDonutProps = {
  holdings?: PortfolioHolding[];
};

const GREEN_PALETTE = ["#0f9f6e", "#16c784", "#27d99a", "#5ee3b4", "#8bf0cc", "#b7f7df"];

function getHoldingValue(holding: PortfolioHolding) {
  return (holding.currentPrice ?? 0) * (holding.quantity ?? 0);
}

export const AllocationDonut = memo(function AllocationDonut({ holdings = [] }: AllocationDonutProps) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const allocation = useMemo(() => {
    const hasSector = holdings.some((holding) => holding.sector);
    const hasIndustry = holdings.some((holding) => holding.industry);
    const field = hasSector ? "sector" : hasIndustry ? "industry" : null;
    if (!field) return null;

    const groups = new Map<string, number>();
    for (const holding of holdings) {
      const label = holding[field];
      const value = getHoldingValue(holding);
      if (!label || value <= 0) continue;
      groups.set(label, (groups.get(label) ?? 0) + value);
    }

    let startAngle = 0;
    const sortedEntries = [...groups.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const total = sortedEntries.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0 || sortedEntries.length === 0) return null;
    const entries = sortedEntries.map((item) => {
      const angle = (item.value / total) * 360;
      const entry = { ...item, startAngle, endAngle: startAngle + angle };
      startAngle += angle;
      return entry;
    });
    return { field, entries, total };
  }, [holdings]);

  if (!allocation) {
    return null;
  }

  let running = 0;
  const gradient = allocation.entries
    .map((item, index) => {
      const start = (running / allocation.total) * 100;
      running += item.value;
      const end = (running / allocation.total) * 100;
      const color = GREEN_PALETTE[index % GREEN_PALETTE.length];
      return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ");

  return (
    <div className="ta-allocation-donut-wrap" aria-label={`Portfolio allocation by ${allocation.field}`}>
      <div
        className="ta-allocation-donut"
        style={{ background: `conic-gradient(${gradient})` }}
        onMouseLeave={() => setHoveredLabel(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - (rect.left + rect.width / 2);
          const y = event.clientY - (rect.top + rect.height / 2);
          const distance = Math.sqrt(x * x + y * y);
          const outerRadius = rect.width / 2;
          const innerRadius = outerRadius * 0.29;
          if (distance < innerRadius || distance > outerRadius) {
            setHoveredLabel(null);
            return;
          }
          const degrees = (Math.atan2(y, x) * 180) / Math.PI;
          const angle = (degrees + 450) % 360;
          const hovered = allocation.entries.find(
            (item) => angle >= item.startAngle && angle < item.endAngle,
          );
          setHoveredLabel(hovered?.label ?? null);
        }}
      >
        <div className="ta-allocation-donut-hole">
          <span>{hoveredLabel ?? (allocation.field === "sector" ? "Sector" : "Industry")}</span>
        </div>
      </div>
    </div>
  );
});
