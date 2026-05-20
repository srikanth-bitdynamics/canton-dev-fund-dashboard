'use client';

import type { AppData, Period } from '@/lib/types';
import { fmtCC } from '@/lib/utils';
import { Donut } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface BarProps {
  value: number;
  max: number;
  color: string;
}

function Bar({ value, max, color }: BarProps) {
  return (
    <div
      style={{
        width: 28,
        height: `${(value / max) * 100}%`,
        background: color,
        borderRadius: '4px 4px 0 0',
        minHeight: 2,
      }}
    />
  );
}

function BurnDown() {
  const weeks = 13;
  const ideal = Array.from({ length: weeks }, (_, i) => 7200 - (7200 / (weeks - 1)) * i);
  const actual = [7200, 7050, 6900, 6600, 6200, 5700, 5400, 5100, 4900, 4600, 4400];
  const max = 7200;
  const w = 380;
  const h = 180;
  const stepX = w / (weeks - 1);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${i * stepX},${h - (v / max) * h}`).join(' ');

  return (
    <div>
      <svg
        width={w}
        height={h}
        style={{ width: '100%', height: 180, display: 'block' }}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
      >
        <path
          d={path(ideal)}
          stroke="var(--ink-4)"
          strokeDasharray="3 4"
          fill="none"
          strokeWidth="1.4"
        />
        <path
          d={path(actual) + ` L${(actual.length - 1) * stepX},${h} L0,${h} Z`}
          fill="var(--accent)"
          opacity="0.12"
        />
        <path
          d={path(actual)}
          stroke="var(--accent)"
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="legend" style={{ marginTop: 8 }}>
        <span className="legend-item">
          <span className="legend-sw" style={{ background: 'var(--ink-4)' }} /> Linear burn target
        </span>
        <span className="legend-item">
          <span className="legend-sw" style={{ background: 'var(--accent)' }} /> Actual headroom
          remaining
        </span>
      </div>
    </div>
  );
}

interface CategoryMixProps {
  data: AppData;
}

function CategoryMix({ data }: CategoryMixProps) {
  const approved = data.proposals.filter((p) => p.status === 'approved');
  const byCat = data.CATEGORIES.map((c) => {
    const sum = approved
      .filter((p) => p.category === c.id)
      .reduce((s, p) => s + p.amount_cc, 0);
    return { c, sum };
  });
  const total = byCat.reduce((s, x) => s + x.sum, 0) || 1;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <Donut
        size={140}
        thickness={18}
        slices={byCat.map((x) => ({
          value: x.sum,
          color: `var(--cat-${x.c.tone})`,
          label: x.c.label,
        }))}
        centerLabel={fmtCC(total)}
        centerSub="Committed YTD"
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {byCat.map(({ c, sum }) => (
          <div key={c.id} className="row" style={{ gap: 8, fontSize: 12 }}>
            <span
              className="legend-sw"
              style={{
                background: `var(--cat-${c.tone})`,
                width: 10,
                height: 10,
                borderRadius: 3,
              }}
            />
            <span style={{ flex: 1 }}>{c.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
              {fmtCC(sum)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-4)',
                fontSize: 11,
              }}
            >
              {Math.round((sum / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BudgetView                                                         */
/* ------------------------------------------------------------------ */

interface BudgetViewProps {
  data: AppData;
  period: Period;
}

export default function BudgetView({ data, period }: BudgetViewProps) {
  const quarterRange = (id: string) => {
    const [yStr, qStr] = id.split('-');
    const y = +yStr;
    const q = +qStr.replace('Q', '') - 1;
    return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0) };
  };

  const totals = data.QUARTERS.map((q) => {
    const apQ = data.proposals.filter((p) => p.status === 'approved' && p.quarter === q.id);
    const committed = apQ.reduce((s, p) => s + p.amount_cc, 0);
    const distributed = apQ.reduce(
      (s, p) =>
        s +
        p.milestones
          .filter((m) => m.status === 'delivered')
          .reduce((ss, m) => ss + m.amount_cc, 0),
      0,
    );
    const r = quarterRange(q.id);
    const inP =
      (!period.from || r.end >= period.from) && (!period.to || r.start <= period.to);
    return { ...q, committed, distributed, inPeriod: inP };
  });

  const max = Math.max(...totals.map((t) => t.defined), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Budget &amp; forecast</h1>
          <p className="page-sub">
            5% programmatic allocation of Canton Coin emissions (CIP-0082). Quarterly envelope
            approved by the Foundation board. Highlighted quarters fall inside{' '}
            <strong style={{ color: 'var(--ink-1)' }}>{period.label}</strong>.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Quarterly trend</h3>
            <p className="card-sub">Defined envelope, committed, and distributed by quarter</p>
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'oklch(0.30 0.025 250)' }} />{' '}
              Defined
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--accent)' }} /> Committed
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--good)' }} /> Distributed
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${totals.length}, 1fr)`,
            gap: 20,
            alignItems: 'end',
            height: 280,
            padding: '20px 0 40px',
          }}
        >
          {totals.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                position: 'relative',
                opacity: t.inPeriod ? 1 : 0.45,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -16,
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fmtCC(t.defined)} CC
              </div>
              {t.inPeriod && (
                <div
                  style={{
                    position: 'absolute',
                    inset: '-8px -10px -28px',
                    borderRadius: 8,
                    background: 'var(--accent-bg)',
                    opacity: 0.4,
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 6,
                  height: 200,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <Bar value={t.defined} max={max} color="oklch(0.30 0.025 250)" />
                <Bar value={t.committed} max={max} color="var(--accent)" />
                <Bar value={t.distributed} max={max} color="var(--good)" />
              </div>
              <div
                style={{ fontSize: 12, fontWeight: 500, position: 'relative', zIndex: 1 }}
              >
                {t.label}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {t.defined ? Math.round((t.committed / t.defined) * 100) : 0}% committed &middot;{' '}
                {t.defined ? Math.round((t.distributed / t.defined) * 100) : 0}% paid
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Burn-down &mdash; current quarter</h3>
          </div>
          <BurnDown />
        </div>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Category mix YTD</h3>
          </div>
          <CategoryMix data={data} />
        </div>
      </div>
    </>
  );
}
