'use client';

import type { AppData, Period } from '@/lib/types';
import { fmtCC } from '@/lib/utils';
import { Donut, StatCard } from '@/components/ui/primitives';

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
    // Distributed via real payment rows that fall within this quarter's date range
    const r = quarterRange(q.id);
    const distributed = data.payments
      .filter((pm) => pm.released_at >= r.start && pm.released_at <= r.end)
      .reduce((s, p) => s + p.amount_cc, 0);
    const inP = (!period.from || r.end >= period.from) && (!period.to || r.start <= period.to);
    return { ...q, committed, distributed, inPeriod: inP };
  });

  // Annual aggregates (only matters when there's a single year)
  const years = Array.from(new Set(totals.map((t) => t.id.split('-')[0])));
  const annualByYear = years.map((y) => {
    const qs = totals.filter((t) => t.id.startsWith(y));
    return {
      year: y,
      defined: qs.reduce((s, q) => s + q.defined, 0),
      committed: qs.reduce((s, q) => s + q.committed, 0),
      distributed: qs.reduce((s, q) => s + q.distributed, 0),
      isCurrent: qs.some((q) => q.current),
    };
  });
  const thisYear = annualByYear.find((a) => a.isCurrent) || annualByYear[annualByYear.length - 1];

  const max = Math.max(...totals.map((t) => Math.max(t.defined, t.committed, t.distributed)), 1);
  const ticks = niceTicks(max, 4);
  const chartMax = ticks[ticks.length - 1];

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

      {/* Annual summary KPI strip */}
      {thisYear && (
        <div className="stat-grid">
          <StatCard
            label={`${thisYear.year} budget envelope`}
            value={fmtCC(thisYear.defined)}
            sub={`${data.QUARTERS.filter((q) => q.id.startsWith(thisYear.year)).length} quarters defined`}
          />
          <StatCard
            label="Committed YTD"
            value={fmtCC(thisYear.committed)}
            sub={`${thisYear.defined ? Math.round((thisYear.committed / thisYear.defined) * 100) : 0}% of annual envelope`}
            delta={thisYear.committed > thisYear.defined ? 'Over commitment' : 'Within envelope'}
            deltaTone={thisYear.committed > thisYear.defined ? 'warn' : 'pos'}
          />
          <StatCard
            label="Disbursed YTD"
            value={fmtCC(thisYear.distributed)}
            sub={`${thisYear.committed ? Math.round((thisYear.distributed / thisYear.committed) * 100) : 0}% of committed paid`}
          />
          <StatCard
            label="Headroom remaining"
            value={fmtCC(Math.max(0, thisYear.defined - thisYear.committed))}
            sub={
              thisYear.defined > thisYear.committed
                ? `${fmtCC(thisYear.defined - thisYear.committed)} unallocated`
                : `${fmtCC(thisYear.committed - thisYear.defined)} over budget`
            }
          />
        </div>
      )}

      {/* Quarterly trend — grouped bars with Y axis */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Quarterly trend</h3>
            <p className="card-sub">Defined envelope, committed, and disbursed by quarter</p>
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'oklch(0.30 0.025 250)' }} />
              {' '}Defined
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--accent)' }} />
              {' '}Committed
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--good)' }} />
              {' '}Disbursed
            </span>
          </div>
        </div>

        <QuarterlyChart totals={totals} ticks={ticks} chartMax={chartMax} />
      </div>

      {/* Category mix donut */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3 className="card-title">Category mix YTD</h3>
          <p className="card-sub">Approved CC by SIG category</p>
        </div>
        <CategoryMix data={data} />
      </div>

      {/* Per-quarter breakdown — full width so the numbers have room */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Per-quarter breakdown</h3>
            <p className="card-sub">
              Defined envelope vs. committed proposals and on-chain disbursements, by quarter.
              {' '}<strong style={{ color: 'var(--ink-1)' }}>Headroom</strong> = defined − committed.
            </p>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Quarter</th>
              <th style={{ textAlign: 'right' }}>Defined</th>
              <th style={{ textAlign: 'right' }}>Committed</th>
              <th style={{ textAlign: 'right' }}>Disbursed</th>
              <th style={{ textAlign: 'right' }}>Committed %</th>
              <th style={{ textAlign: 'right' }}>Headroom</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => {
              const headroom = t.defined - t.committed;
              const pct = t.defined ? Math.round((t.committed / t.defined) * 100) : 0;
              return (
                <tr key={t.id} className={t.current ? 'row' : ''}>
                  <td>
                    <strong>{t.label}</strong>
                    {t.current && (
                      <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 11 }}>● now</span>
                    )}
                  </td>
                  <td className="num">{fmtCC(t.defined)}</td>
                  <td className="num" style={{ color: t.committed > t.defined ? 'var(--warn)' : undefined }}>
                    {fmtCC(t.committed)}
                  </td>
                  <td className="num">{fmtCC(t.distributed)}</td>
                  <td className="num" style={{ color: pct > 100 ? 'var(--warn)' : 'var(--ink-3)' }}>{pct}%</td>
                  <td className="num" style={{ color: headroom < 0 ? 'var(--warn)' : 'var(--good)' }}>
                    {headroom >= 0 ? fmtCC(headroom) : `−${fmtCC(Math.abs(headroom))}`}
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: '2px solid var(--line)' }}>
              <td><strong>Total</strong></td>
              <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.defined, 0))}</strong></td>
              <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.committed, 0))}</strong></td>
              <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.distributed, 0))}</strong></td>
              <td className="num"></td>
              <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.defined - t.committed, 0))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  QuarterlyChart — grouped bars with Y axis + gridlines              */
/* ------------------------------------------------------------------ */

interface QuarterTotal {
  id: string;
  label: string;
  defined: number;
  committed: number;
  distributed: number;
  inPeriod: boolean;
  current?: boolean;
}

function QuarterlyChart({
  totals,
  ticks,
  chartMax,
}: {
  totals: QuarterTotal[];
  ticks: number[];
  chartMax: number;
}) {
  const Y_AXIS_W = 60;
  const CHART_H = 220;
  const X_LABEL_H = 36;

  return (
    <div style={{ display: 'flex', height: CHART_H + X_LABEL_H + 10, paddingTop: 8 }}>
      {/* Y axis */}
      <div
        style={{
          width: Y_AXIS_W,
          height: CHART_H,
          position: 'relative',
          flexShrink: 0,
          borderRight: '1px solid var(--line)',
        }}
      >
        {ticks.map((t) => (
          <div
            key={t}
            style={{
              position: 'absolute',
              right: 8,
              bottom: `${(t / chartMax) * 100}%`,
              transform: 'translateY(50%)',
              fontSize: 10,
              color: 'var(--ink-4)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}
          >
            {fmtChartCC(t)}
          </div>
        ))}
      </div>

      {/* Chart column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Bars area with gridlines */}
        <div style={{ position: 'relative', height: CHART_H }}>
          {ticks.map((t) => (
            <div
              key={`grid-${t}`}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${(t / chartMax) * 100}%`,
                height: 1,
                background: t === 0 ? 'var(--line)' : 'var(--line-soft)',
                opacity: t === 0 ? 1 : 0.5,
              }}
            />
          ))}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${totals.length}, 1fr)`,
              height: '100%',
              gap: 12,
              padding: '0 8px',
              position: 'relative',
            }}
          >
            {totals.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 6,
                  height: '100%',
                  opacity: t.inPeriod ? 1 : 0.5,
                  background: t.current ? 'var(--accent-bg)' : 'transparent',
                  borderRadius: 4,
                  padding: '0 4px',
                }}
              >
                <ChartBar value={t.defined} max={chartMax} color="oklch(0.30 0.025 250)" label="Defined" />
                <ChartBar value={t.committed} max={chartMax} color="var(--accent)" label="Committed" />
                <ChartBar value={t.distributed} max={chartMax} color="var(--good)" label="Disbursed" />
              </div>
            ))}
          </div>
        </div>

        {/* X axis labels */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${totals.length}, 1fr)`,
            height: X_LABEL_H,
            padding: '6px 8px 0',
            gap: 12,
          }}
        >
          {totals.map((t) => (
            <div
              key={`label-${t.id}`}
              style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)' }}
            >
              <div style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{t.label}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>
                {t.defined ? Math.round((t.committed / t.defined) * 100) : 0}% committed
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  return (
    <div
      title={`${label}: ${value.toLocaleString()} CC`}
      style={{
        width: 18,
        height: `${(value / max) * 100}%`,
        background: color,
        borderRadius: '3px 3px 0 0',
        minHeight: value > 0 ? 2 : 0,
        opacity: value === 0 ? 0.25 : 1,
        border: value === 0 ? '1px dashed var(--line)' : undefined,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  CategoryMix donut                                                  */
/* ------------------------------------------------------------------ */

function CategoryMix({ data }: { data: AppData }) {
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
        size={132}
        thickness={16}
        slices={byCat.map((x) => ({
          value: x.sum,
          color: `var(--cat-${x.c.tone})`,
          label: x.c.label,
        }))}
        centerLabel={fmtChartCC(total)}
        centerSub="Approved CC"
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {byCat
          .filter((x) => x.sum > 0)
          .sort((a, b) => b.sum - a.sum)
          .map((x) => (
            <div key={x.c.id} className="row" style={{ gap: 8, fontSize: 12 }}>
              <span
                className="legend-sw"
                style={{
                  background: `var(--cat-${x.c.tone})`,
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                }}
              />
              <span style={{ flex: 1 }}>{x.c.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                {fmtCC(x.sum)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-4)',
                  fontSize: 11,
                  minWidth: 30,
                  textAlign: 'right',
                }}
              >
                {Math.round((x.sum / total) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart helpers                                                      */
/* ------------------------------------------------------------------ */

function niceTicks(max: number, n: number): number[] {
  if (max <= 0) return [0, 1];
  const roughStep = max / (n - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceStep: number;
  if (normalized < 1.5) niceStep = 1 * magnitude;
  else if (normalized < 3) niceStep = 2 * magnitude;
  else if (normalized < 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const ticks: number[] = [];
  let v = 0;
  while (v <= max + niceStep / 2) {
    ticks.push(v);
    v += niceStep;
  }
  return ticks;
}

function fmtChartCC(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
