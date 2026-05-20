'use client';

import type { CSSProperties, ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Pill                                                               */
/* ------------------------------------------------------------------ */

interface PillProps {
  tone?: string;
  dot?: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function Pill({ tone = 'neutral', dot, children, style }: PillProps) {
  return (
    <span className={`pill pill-${tone}`} style={style}>
      {dot && <span className="pill-dot" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  StatCard                                                           */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: string;
  deltaTone?: 'pos' | 'neg' | 'warn';
  children?: ReactNode;
  span?: number;
}

export function StatCard({
  label,
  value,
  sub,
  delta,
  deltaTone = 'pos',
  children,
  span = 1,
}: StatCardProps) {
  return (
    <div className="stat" style={{ gridColumn: `span ${span}` }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {delta != null && (
        <div className={`stat-delta delta-${deltaTone}`}>
          {deltaTone === 'pos' ? '▲' : deltaTone === 'neg' ? '▼' : '◆'} {delta}
        </div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SegmentedBar                                                       */
/* ------------------------------------------------------------------ */

interface Segment {
  value: number;
  color: string;
  label: string;
}

interface SegmentedBarProps {
  segments: Segment[];
  total?: number;
  height?: number;
  showLabels?: boolean;
}

export function SegmentedBar({ segments, total, height = 8 }: SegmentedBarProps) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const cap = total ?? sum;
  return (
    <div className="segbar" style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={i}
          className="segbar-seg"
          title={`${s.label}: ${Math.round(s.value).toLocaleString()} CC`}
          style={{ width: `${(s.value / cap) * 100}%`, background: s.color }}
        />
      ))}
      {sum < cap && (
        <div className="segbar-rest" style={{ width: `${((cap - sum) / cap) * 100}%` }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline                                                          */
/* ------------------------------------------------------------------ */

interface SparklineProps {
  values: number[];
  height?: number;
  width?: number;
  stroke?: string;
}

export function Sparkline({
  values,
  height = 32,
  width = 96,
  stroke = 'var(--accent)',
}: SparklineProps) {
  if (!values || !values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const stepX = width / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [i * stepX, height - ((v - min) / span) * height]);
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const area = d + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} className="sparkline">
      <path d={area} fill={stroke} opacity="0.12" />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="2"
        fill={stroke}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Donut                                                              */
/* ------------------------------------------------------------------ */

interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export function Donut({ slices, size = 120, thickness = 14, centerLabel, centerSub }: DonutProps) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={thickness}
        />
        {slices.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {centerLabel && (
        <div className="donut-center">
          <div className="donut-center-label">{centerLabel}</div>
          {centerSub && <div className="donut-center-sub">{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chip                                                               */
/* ------------------------------------------------------------------ */

interface ChipProps {
  on?: boolean;
  children: ReactNode;
  onClick?: () => void;
}

export function Chip({ on, children, onClick }: ChipProps) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
