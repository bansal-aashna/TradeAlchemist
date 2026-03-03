const stripFields = [
  "Total Portfolio Value",
  "Investment Value",
  "Unrealised P/L",
  "Today's P/L",
  "Buying Power",
] as const;

export function PortfolioStrip() {
  return (
    <aside className="ta-fixed-strip" aria-label="Portfolio summary strip">
      <div className="ta-fixed-strip-inner">
        {stripFields.map((label) => (
          <article key={label} className="ta-fixed-strip-item">
            <p className="ta-fixed-strip-label">{label}</p>
            <p className="ta-fixed-strip-value neutral">--</p>
          </article>
        ))}
      </div>
    </aside>
  );
}
