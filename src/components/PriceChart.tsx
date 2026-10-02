/** Responsive SVG price chart: area line, volume bars, hover crosshair. */

import { useEffect, useId, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Bar } from "../lib/types";
import { formatCompact, formatPrice } from "../lib/format";

interface Props {
  bars: Bar[];
  /** Color direction of the series (based on first→last change). */
  positive?: boolean;
  height?: number;
}

interface HoverInfo {
  index: number;
  x: number;
  y: number;
}

const PAD = { top: 14, right: 52, bottom: 26, left: 8 };
const VOLUME_SHARE = 0.18;

export default function PriceChart({ bars, positive = true, height = 340 }: Props) {
  const gradId = useId();
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Phones render a smaller viewBox (400 units) so axis labels, ticks and the
  // crosshair stay legible after the SVG scales down to ~300–430px containers.
  // Desktop keeps the original 800-unit geometry untouched.
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 639px)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => {
      setNarrow(mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const geom = useMemo(() => {
    if (bars.length < 2) return null;
    const width = narrow ? 400 : 800; // viewBox units; SVG scales to container
    const padRight = narrow ? 88 : 52;
    const labelFs = narrow ? 14 : 11;
    const innerW = width - PAD.left - padRight;
    const innerH = height - PAD.top - PAD.bottom;
    const volH = innerH * VOLUME_SHARE;
    const priceH = innerH - volH - 8;

    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;
    for (const b of bars) {
      if (b.l < min) min = b.l;
      if (b.h > max) max = b.h;
      if (b.v > maxVol) maxVol = b.v;
    }
    const padRange = (max - min) * 0.08 || max * 0.02 || 1;
    min -= padRange;
    max += padRange;

    const x = (i: number) => PAD.left + (i / (bars.length - 1)) * innerW;
    const y = (price: number) => PAD.top + (1 - (price - min) / (max - min)) * priceH;
    const volTop = PAD.top + priceH + 8;
    const volY = (v: number) => volTop + (1 - (maxVol === 0 ? 0 : v / maxVol)) * volH;

    const linePts = bars.map((b, i) => `${x(i).toFixed(2)},${y(b.c).toFixed(2)}`).join(" ");
    const areaPath =
      `M${x(0).toFixed(2)},${(PAD.top + priceH).toFixed(2)} ` +
      bars.map((b, i) => `L${x(i).toFixed(2)},${y(b.c).toFixed(2)}`).join(" ") +
      ` L${x(bars.length - 1).toFixed(2)},${(PAD.top + priceH).toFixed(2)} Z`;

    const yTicks = [max, (max + min) / 2, min].map((v) => ({ v, y: y(v) }));
    const xTickIdx = [0, Math.floor((bars.length - 1) / 2), bars.length - 1];

    return {
      width,
      innerW,
      padRight,
      labelFs,
      compact: narrow,
      priceBottom: PAD.top + priceH,
      min,
      max,
      x,
      y,
      volY,
      linePts,
      areaPath,
      yTicks,
      xTickIdx,
      volTop,
      volH,
    };
  }, [bars, height, narrow]);

  if (!geom) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-500">
        Not enough data to chart this range.
      </div>
    );
  }

  const stroke = positive ? "var(--color-up)" : "var(--color-down)";
  const fillTop = positive ? "rgba(52,211,153,0.28)" : "rgba(251,113,133,0.26)";

  function handleMove(e: ReactMouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * geom!.width;
    const frac = (relX - PAD.left) / geom!.innerW;
    const index = Math.round(frac * (bars.length - 1));
    if (index < 0 || index >= bars.length) {
      setHover(null);
      return;
    }
    setHover({ index, x: geom!.x(index), y: geom!.y(bars[index].c) });
  }

  const hoverBar = hover ? bars[hover.index] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${geom.width} ${height}`}
        className="w-full h-auto select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Price chart, ${bars.length} points`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillTop} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>

        {/* horizontal grid + price axis */}
        {geom.yTicks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={geom.width - geom.padRight}
              y1={t.y}
              y2={t.y}
              stroke="var(--color-ink-700)"
              strokeDasharray="3 5"
            />
            <text
              x={geom.width - geom.padRight + 6}
              y={t.y + 4}
              fontSize={geom.labelFs}
              fill="var(--color-ink-600)"
              className="num"
            >
              {formatPrice(t.v)}
            </text>
          </g>
        ))}

        {/* volume bars */}
        {bars.map((b, i) => {
          const barW = Math.max(1, geom.innerW / bars.length - 1);
          const vy = geom.volY(b.v);
          return (
            <rect
              key={`v-${b.t}`}
              x={geom.x(i) - barW / 2}
              y={vy}
              width={barW}
              height={Math.max(0.5, geom.volTop + geom.volH - vy)}
              fill="var(--color-ink-600)"
              opacity={0.55}
            />
          );
        })}

        {/* price area + line */}
        <path d={geom.areaPath} fill={`url(#${gradId})`} />
        <polyline
          points={geom.linePts}
          fill="none"
          stroke={stroke}
          strokeWidth={geom.compact ? 3 : 2.2}
          strokeLinejoin="round"
        />

        {/* x labels */}
        {geom.xTickIdx.map((i) => (
          <text
            key={`x-${i}`}
            x={geom.x(i)}
            y={height - 8}
            fontSize={geom.labelFs}
            fill="var(--color-ink-600)"
            textAnchor={i === 0 ? "start" : i === bars.length - 1 ? "end" : "middle"}
            className="num"
          >
            {bars[i].t.slice(0, 10)}
          </text>
        ))}

        {/* hover crosshair */}
        {hover && hoverBar && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={geom.volTop + geom.volH}
              stroke="var(--color-flare-400)"
              strokeDasharray="3 4"
              opacity="0.7"
            />
            <circle cx={hover.x} cy={hover.y} r={geom.compact ? 5.5 : 4} fill={stroke} />
          </g>
        )}
      </svg>

      {/* floating readout */}
      {hover && hoverBar && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-ink-600 bg-ink-900/95 px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${(hover.x / geom.width) * 100}%`,
            transform: `translateX(${hover.x > geom.width * 0.62 ? "-108%" : "8px"})`,
          }}
        >
          <div className="text-slate-400 num">{hoverBar.t}</div>
          <div className="flex gap-3 mt-1 num">
            <span className="text-slate-300">O {formatPrice(hoverBar.o)}</span>
            <span className="text-slate-300">H {formatPrice(hoverBar.h)}</span>
          </div>
          <div className="flex gap-3 num">
            <span className="text-slate-300">L {formatPrice(hoverBar.l)}</span>
            <span className="text-slate-300">C {formatPrice(hoverBar.c)}</span>
          </div>
          <div className="text-slate-500 num mt-1">Vol {formatCompact(hoverBar.v)}</div>
        </div>
      )}
    </div>
  );
}
