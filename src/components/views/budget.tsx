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

      {/* Quarterly trend — one envelope bar per quarter, filled bottom-up */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Quarterly trend</h3>
            <p className="card-sub">
              The dark horizontal line marks each quarter&rsquo;s defined envelope (100%).
              Bars fill from the bottom up: green = disbursed, blue = committed not yet paid.
              When commitments exceed the envelope, the bar pushes past the line into the red over-budget zone.
            </p>
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--good)' }} /> Disbursed
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--accent)' }} /> Committed (not yet paid)
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ borderTop: '2px solid var(--ink-2)', height: 1 }} /> Envelope
            </span>
            <span className="legend-item">
              <span className="legend-sw" style={{ background: 'var(--warn)', opacity: 0.25 }} /> Over budget
            </span>
          </div>
        </div>

        <QuarterlyEnvelopeChart totals={totals} />
      </div>

      {/* Category mix donut */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3 className="card-title">Category mix YTD</h3>
          <p className="card-sub">Approved CC by SIG category</p>
        </div>
        <CategoryMix data={data} />
      </div>

      {/* Per-quarter breakdown */}
      <div>
        <div style={{ marginBottom: 10 }}>
          <h3 className="card-title">Per-quarter breakdown</h3>
          <p className="card-sub">
            Defined envelope vs. committed proposals and on-chain disbursements, by quarter.
            {' '}<strong style={{ color: 'var(--ink-1)' }}>Headroom</strong> = defined − committed.
          </p>
        </div>
        <div className="tbl-wrap">
          <table className="qbreak">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Quarter</th>
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
                  <tr key={t.id} className={t.current ? 'qbreak-current' : ''}>
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
              <tr className="qbreak-total">
                <td><strong>Total</strong></td>
                <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.defined, 0))}</strong></td>
                <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.committed, 0))}</strong></td>
                <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.distributed, 0))}</strong></td>
                <td className="num">—</td>
                <td className="num"><strong>{fmtCC(totals.reduce((s, t) => s + t.defined - t.committed, 0))}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  QuarterlyEnvelopeChart — one bar per quarter, stacked bottom-up    */
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

function QuarterlyEnvelopeChart({ totals }: { totals: QuarterTotal[] }) {
  const CHART_H = 260;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: CHART_H + 80, padding: '12px 4px 0' }}>
      {totals.map((t) => {
        // Each quarter is independently scaled so 100% of the bar = the LARGER
        // of (defined envelope, committed). That way an over-committed quarter
        // physically extends past the envelope marker — you can SEE the breach.
        const scaleMax = Math.max(t.defined, t.committed, 1);

        // Heights as % of the bar (which spans 0..scaleMax)
        const distPct = (t.distributed / scaleMax) * 100;
        const commOnlyPct = Math.max(0, ((t.committed - t.distributed) / scaleMax) * 100);
        const envelopePct = (t.defined / scaleMax) * 100; // horizontal marker line
        const overCommitted = t.committed > t.defined && t.defined > 0;
        // The portion of the committed stack that sits ABOVE the envelope (over-budget zone)
        const overByPct = overCommitted ? ((t.committed - t.defined) / scaleMax) * 100 : 0;
        const committedPctOfEnvelope = t.defined ? Math.round((t.committed / t.defined) * 100) : 0;

        return (
          <div
            key={t.id}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              opacity: t.inPeriod ? 1 : 0.55,
            }}
          >
            {/* Top label: defined envelope total */}
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', minHeight: 28 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-1)', fontWeight: 500 }}>
                {fmtChartCC(t.defined)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>envelope</div>
            </div>

            {/* The bar */}
            <div
              style={{
                width: '100%',
                maxWidth: 84,
                height: CHART_H,
                position: 'relative',
                background: 'var(--surface-3)',
                border: `1px solid ${t.current ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 6,
                overflow: 'visible',
                outline: t.current ? '2px solid var(--accent-bg)' : 'none',
                outlineOffset: 1,
              }}
              title={`${t.label}\nDefined: ${t.defined.toLocaleString()} CC\nCommitted: ${t.committed.toLocaleString()} CC (${committedPctOfEnvelope}% of envelope)\nDisbursed: ${t.distributed.toLocaleString()} CC`}
            >
              {/* Over-budget zone — translucent red wash on the portion above the envelope */}
              {overCommitted && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${envelopePct}%`,
                    height: `${overByPct}%`,
                    background: 'var(--warn-bg, rgba(220, 80, 60, 0.12))',
                    borderTop: '1px dashed var(--warn)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Disbursed (green) — anchored to bottom */}
              {distPct > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${distPct}%`,
                    background: 'var(--good)',
                    borderRadius: '0 0 5px 5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                  }}
                >
                  {distPct >= 12 ? `${Math.round(distPct)}%` : ''}
                </div>
              )}

              {/* Committed-not-yet-paid (accent) — stacked on top of disbursed */}
              {commOnlyPct > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${distPct}%`,
                    height: `${commOnlyPct}%`,
                    background: overCommitted
                      ? 'linear-gradient(to top, var(--accent), var(--warn))'
                      : 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                  }}
                >
                  {commOnlyPct >= 12 ? `${committedPctOfEnvelope}% committed` : ''}
                </div>
              )}

              {/* Envelope marker line — the 100%-of-envelope reference */}
              {t.defined > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: -4,
                    right: -4,
                    bottom: `${envelopePct}%`,
                    height: 0,
                    borderTop: `2px ${overCommitted ? 'dashed' : 'solid'} ${overCommitted ? 'var(--warn)' : 'var(--ink-2)'}`,
                    pointerEvents: 'none',
                  }}
                  title={`Envelope: ${t.defined.toLocaleString()} CC`}
                >
                  <span
                    style={{
                      position: 'absolute',
                      right: -2,
                      top: -16,
                      fontSize: 9,
                      color: overCommitted ? 'var(--warn)' : 'var(--ink-3)',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--surface-1)',
                      padding: '0 3px',
                      borderRadius: 2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {overCommitted ? `${committedPctOfEnvelope}%` : '100%'}
                  </span>
                </div>
              )}
            </div>

            {/* Bottom label: quarter name + status pills */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-1)', fontWeight: 500 }}>
                {t.label}
                {t.current && (
                  <span style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 11 }}>● now</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>
                <div>
                  <span style={{ color: 'var(--good)' }}>{fmtChartCC(t.distributed)}</span>
                  {' / '}
                  <span style={{ color: overCommitted ? 'var(--warn)' : 'var(--accent)' }}>
                    {fmtChartCC(t.committed)}
                  </span>
                </div>
                <div style={{ color: overCommitted ? 'var(--warn)' : 'var(--ink-4)' }}>
                  {committedPctOfEnvelope}% committed
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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

function fmtChartCC(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
