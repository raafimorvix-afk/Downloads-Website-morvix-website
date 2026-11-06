"use client";

import { useState } from "react";

import { SERIES } from "@/lib/palette";

type Day = { d: string; submitted: number; passes: number; declines: number };
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Two series over time on one axis (same unit: lead counts). Crosshair + tooltip on hover. */
export function TrendChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, L = 32, R = 12, T = 12, B = 26;
  const max = Math.max(4, ...days.map((d) => Math.max(d.submitted, d.passes)));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => L + (days.length <= 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const line = (k: "submitted" | "passes") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join("");
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(days.length / 6);
  const series = [
    { key: "submitted" as const, name: "Leads submitted", color: SERIES[0] },
    { key: "passes" as const, name: "Passes", color: SERIES[1] },
  ];
  const h = hover !== null ? days[hover] : null;
  return (
    <figure className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Leads submitted and passes per day. Total submitted ${days.reduce((a, d) => a + d.submitted, 0)}, passes ${days.reduce((a, d) => a + d.passes, 0)}.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - L) / (W - L - R)) * (days.length - 1));
          setHover(Math.max(0, Math.min(days.length - 1, i)));
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">{t}</text>
          </g>
        ))}
        {days.map((d, i) => i % labelEvery === 0 && (
          <text key={d.d} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">{fmtDay(d.d)}</text>
        ))}
        {series.map((s) => <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {hover !== null && h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(h[s.key])} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-6 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `min(calc(${(x(hover) / W) * 100}% + 8px), calc(100% - 150px))` }}>
          <div className="mb-1 font-medium">{fmtDay(h.d)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}: <b>{h[s.key]}</b></div>
          ))}
          <div className="text-slate-300">Declines: {h.declines}</div>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars, one series. Values printed at the bar end; hover shows the detail line. */
export function BarList({ rows, color = SERIES[0], unit = "", empty = "No data yet." }: {
  rows: { label: string; value: number; detail?: string }[]; color?: string; unit?: string; empty?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5" onMouseLeave={() => setHover(null)}>
      {rows.map((r, i) => (
        <li key={r.label} className="relative" onMouseEnter={() => setHover(i)}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 font-semibold text-slate-900">{unit}{r.value.toLocaleString("en-US")}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full transition-[width]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </div>
          {hover === i && r.detail && (
            <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow">{r.detail}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Part-to-whole split of results. Status colours + icon + label, never colour alone. */
export function ResultSplit({ parts }: { parts: { label: string; value: number; color: string; icon: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!total) return <p className="py-6 text-center text-sm text-slate-500">No results in this period yet.</p>;
  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")} onMouseLeave={() => setHover(null)}>
        {parts.filter((p) => p.value).map((p, i) => (
          <div key={p.label} onMouseEnter={() => setHover(i)} title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: hover === null || hover === i ? 1 : 0.5 }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: p.color }} aria-hidden="true">{p.icon}</span>
            <span className="text-slate-700">{p.label}</span>
            <span className="ml-auto font-semibold">{p.value}</span>
            <span className="w-10 text-right text-xs text-slate-500">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
