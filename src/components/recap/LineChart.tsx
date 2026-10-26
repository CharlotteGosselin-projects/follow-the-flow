import { useLayoutEffect, useRef, useState } from 'react';

export interface LineSeries {
  /** Colour slot 1–3. */
  slot: number;
  /** One value per position; null (nothing logged) breaks the line instead of dropping it to zero. */
  values: (number | null)[];
}

export interface Readout {
  head: string;
  rows: { slot: number; value: string; name: string }[];
}

const H = 110;
const TOP = 16;
const BOTTOM = 18;
const BASE = TOP + H;

/** Watch an element's width, so the chart can be drawn in real pixels (crisp text, no stretching). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Runs of consecutive logged positions. */
function runs(values: (number | null)[]): number[][] {
  const out: number[][] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const last = out[out.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else out.push([i]);
  });
  return out;
}

/**
 * A line chart of up to three series on one shared scale. Hover, tap or arrow keys show a
 * guide line and the readout for that position; the table under the chart has every value too.
 */
export function LineChart({
  series,
  n,
  max,
  topLabel,
  ticks,
  title,
  readout,
}: {
  series: LineSeries[];
  n: number;
  max: number;
  topLabel: string;
  ticks: [number, string][];
  title: string;
  readout: (i: number) => Readout;
}) {
  const [wrapRef, width] = useWidth();
  const [current, setCurrent] = useState<number | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const slot = width / n;
  const px = (i: number) => (i + 0.5) * slot;
  const py = (v: number) => BASE - (H * Math.min(v, max)) / max;

  // Centre the readout on the guide line, kept inside the chart's width (needs its rendered size).
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (current == null || !tip) return;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(width - w, Math.max(0, (current + 0.5) * slot - w / 2))}px`;
  }, [current, width, slot]);

  const show = (i: number) => setCurrent(Math.max(0, Math.min(n - 1, i)));
  const fromPointer = (e: React.PointerEvent<SVGSVGElement>) =>
    show(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / slot));
  const r = current != null ? readout(current) : null;

  return (
    <div ref={wrapRef} className="chart relative">
      {r && (
        <div
          ref={tipRef}
          className="chart-tip pointer-events-none absolute top-[calc(100%+2px)] z-10 rounded-md bg-ink px-2 py-0.5 text-[.78rem] whitespace-nowrap text-bg"
        >
          <div className="mb-0.5 font-semibold">{r.head}</div>
          {r.rows.map((row) => (
            <div key={row.slot} className={`s${row.slot} flex items-center gap-1.5`}>
              <span className="w-3 border-t-2 border-(--series)" />
              <strong>{row.value}</strong>
              <span className="opacity-75">{row.name}</span>
            </div>
          ))}
        </div>
      )}
      {width > 0 && (
        <svg
          width={width}
          height={BASE + BOTTOM}
          viewBox={`0 0 ${width} ${BASE + BOTTOM}`}
          role="img"
          tabIndex={0}
          aria-label={`${title}. Use the left and right arrow keys to read each value.`}
          className="block touch-pan-y rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onPointerMove={fromPointer}
          onPointerDown={fromPointer}
          onPointerLeave={() => setCurrent(null)}
          onBlur={() => setCurrent(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              show(current == null ? 0 : current + (e.key === 'ArrowRight' ? 1 : -1));
            } else if (e.key === 'Escape') setCurrent(null);
          }}
        >
          <line x1={0} x2={width} y1={TOP} y2={TOP} className="stroke-line" />
          <line x1={0} x2={width} y1={BASE} y2={BASE} className="stroke-line" />
          <text x={0} y={TOP - 5} className="fill-muted text-[10px]">
            {topLabel}
          </text>
          {series.map((s) =>
            runs(s.values).map((run) => {
              const d = run.map((i, k) => `${k ? 'L' : 'M'}${px(i)},${py(s.values[i]!)}`).join('');
              if (run.length === 1) {
                // A lone logged day has no neighbours to join, so it shows as a dot.
                return (
                  <Dot key={`${s.slot}-${run[0]}`} slot={s.slot} x={px(run[0]!)} y={py(s.values[run[0]!]!)} />
                );
              }
              return (
                <g key={`${s.slot}-${run[0]}`} className={`s${s.slot}`}>
                  {/* A light wash under a single line; with several it would only muddy them. */}
                  {series.length === 1 && (
                    <path
                      d={`${d}L${px(run[run.length - 1]!)},${BASE}L${px(run[0]!)},${BASE}Z`}
                      className="fill-(--series) opacity-10"
                    />
                  )}
                  <path
                    d={d}
                    className={`chart-line s${s.slot} fill-none stroke-(--series) stroke-2`}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            }),
          )}
          {current != null && (
            <>
              <line x1={px(current)} x2={px(current)} y1={TOP} y2={BASE} className="stroke-muted" />
              {series.map((s) => {
                const v = s.values[current];
                return v == null ? null : <Dot key={s.slot} slot={s.slot} x={px(current)} y={py(v)} />;
              })}
            </>
          )}
          {ticks.map(([i, label]) => (
            <text
              key={i}
              x={Math.min(width - 2, Math.max(2, px(i)))}
              y={BASE + 13}
              textAnchor="middle"
              className="fill-muted text-[10px] tabular-nums"
            >
              {label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

/** A marker with a ring in the card colour, so it stays legible where lines cross. */
function Dot({ slot, x, y }: { slot: number; x: number; y: number }) {
  return <circle cx={x} cy={y} r={4} className={`s${slot} fill-(--series) stroke-card stroke-2`} />;
}
