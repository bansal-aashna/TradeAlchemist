"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const CANDLES = [
  { o: 42, h: 56, l: 36, c: 50 },
  { o: 50, h: 62, l: 44, c: 46 },
  { o: 46, h: 58, l: 38, c: 55 },
  { o: 55, h: 66, l: 50, c: 60 },
  { o: 60, h: 70, l: 52, c: 54 },
  { o: 54, h: 64, l: 46, c: 62 },
  { o: 62, h: 74, l: 56, c: 70 },
  { o: 70, h: 78, l: 60, c: 64 },
  { o: 64, h: 72, l: 56, c: 68 },
  { o: 68, h: 80, l: 62, c: 76 },
  { o: 76, h: 84, l: 68, c: 72 },
  { o: 72, h: 82, l: 64, c: 79 },
  { o: 79, h: 88, l: 72, c: 86 },
  { o: 86, h: 92, l: 78, c: 80 },
  { o: 80, h: 90, l: 72, c: 88 },
  { o: 88, h: 96, l: 82, c: 94 },
];

function CandleChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>(".ta-candle-body, .ta-candle-wick");
    items.forEach((item, i) => {
      item.style.opacity = "0";
      item.style.transform = "scaleY(0)";
      setTimeout(() => {
        item.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        item.style.opacity = "1";
        item.style.transform = "scaleY(1)";
      }, i * 40);
    });
  }, []);

  const allPrices = CANDLES.flatMap((c) => [c.h, c.l]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP;
  const H = 120;
  const toY = (p: number) => H - ((p - minP) / range) * H;

  return (
    <div ref={containerRef} className="ta-candle-chart" aria-label="Simulated price chart">
      {CANDLES.map((c, i) => {
        const up = c.c >= c.o;
        const bodyTop = toY(Math.max(c.o, c.c));
        const bodyH = Math.max(3, Math.abs(toY(c.o) - toY(c.c)));
        const wickTop = toY(c.h);
        const wickH = toY(c.l) - toY(c.h);
        return (
          <div key={i} className="ta-candle-col">
            <div
              className="ta-candle-wick"
              style={{
                top: wickTop,
                height: wickH,
                transformOrigin: "top center",
              }}
            />
            <div
              className={`ta-candle-body ${up ? "up" : "dn"}`}
              style={{
                top: bodyTop,
                height: bodyH,
                transformOrigin: "bottom center",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="ta-page">
      {/* Ambient glow */}
      <div className="ta-glow" aria-hidden="true" />

      {/* NAV */}
      <nav className="ta-nav" aria-label="Landing navigation">
        <div className="ta-brand">
          <img src="/logo-dark.png" alt="TradeAlchemist Logo" className="ta-brand-img" />
          <span className="ta-brand-name">TradeAlchemist</span>
        </div>
        <div className="ta-nav-links">
          <Link href="/login" className="ta-nav-login">Login</Link>
          <Link href="/signup" className="ta-nav-signup">Sign Up</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="ta-hero">
        <div className="ta-hero-content">
          <p className="ta-kicker">
            <span className="ta-kicker-dot" aria-hidden="true" />
            Paper Trading Simulator
          </p>
          <h1 className="ta-h1">
            Trade<br />
            <span className="ta-h1-accent">Alchemist</span>
          </h1>
          <p className="ta-desc">
            Master the markets with virtual capital. Experience live simulated prices,
            advanced portfolio tracking, and professional-grade analysis tools in one seamless interface.
          </p>
          <div className="ta-actions">
            <Link href="/signup" className="ta-cta">
              Start Trading Now
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/login" className="ta-secondary-btn">Sign In to Dashboard</Link>
          </div>
          <p className="ta-creators">
            Engineered by Aashna Bansal &amp; Rudra Rishi
          </p>
        </div>

        {/* SCROLL HINT */}
        <div className="ta-scroll-hint">
          <span>Explore Features</span>
          <div className="ta-scroll-line" />
        </div>
      </section>

      {/* USP */}
      <section className="ta-usp" aria-label="Key features">
        {[
          {
            num: "01",
            title: "Risk-Free Practice",
            body: "Experiment with buy, sell and limit-order strategies without risking real capital.",
          },
          {
            num: "02",
            title: "Simulated Live Prices",
            body: "Refresh or auto-run simulated price ticks to see portfolio values move in real time.",
          },
          {
            num: "03",
            title: "Portfolio Intelligence",
            body: "Track holdings, P&L, watchlists, sector allocation, and charts in one focused dashboard.",
          },
        ].map((item) => (
          <article key={item.num} className="ta-usp-item">
            <span className="ta-usp-num">{item.num}</span>
            <h2 className="ta-usp-title">{item.title}</h2>
            <p className="ta-usp-body">{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
