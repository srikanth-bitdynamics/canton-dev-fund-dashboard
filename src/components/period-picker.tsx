'use client';

import { useState, useEffect, useRef } from 'react';
import { CalGlyph, IconChevron } from '@/components/ui/icons';
import type { Period } from '@/lib/types';

interface PeriodPickerProps {
  value: Period;
  onChange: (p: Period) => void;
}

const TODAY = new Date();

const startOfMonth   = (y: number, m: number) => new Date(y, m, 1);
const endOfMonth     = (y: number, m: number) => new Date(y, m + 1, 0);
const startOfQuarter = (y: number, q: number) => new Date(y, q * 3, 1);
const endOfQuarter   = (y: number, q: number) => new Date(y, q * 3 + 3, 0);
const startOfYear    = (y: number) => new Date(y, 0, 1);
const endOfYear      = (y: number) => new Date(y, 11, 31);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtRange(from: Date | null, to: Date | null): string {
  if (!from && !to) return 'All time';
  if (!from) return 'All time';
  if (!to) return `Since ${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  if (sameMonth && from.getDate() === 1 && to.getDate() === endOfMonth(to.getFullYear(), to.getMonth()).getDate()) {
    return `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  }
  if (sameYear) {
    return `${MONTHS[from.getMonth()]} ${from.getDate()} – ${MONTHS[to.getMonth()]} ${to.getDate()}, ${from.getFullYear()}`;
  }
  return `${MONTHS[from.getMonth()]} ${from.getDate()}, ${from.getFullYear()} – ${MONTHS[to.getMonth()]} ${to.getDate()}, ${to.getFullYear()}`;
}

interface Preset {
  id: string;
  label: string;
  from: Date | null;
  to: Date | null;
}

function buildPresets(): Preset[] {
  const y = TODAY.getFullYear();
  const m = TODAY.getMonth();
  const q = Math.floor(m / 3);
  return [
    { id: 'this-month',   label: 'This month',     from: startOfMonth(y, m),         to: endOfMonth(y, m) },
    { id: 'last-month',   label: 'Last month',     from: startOfMonth(y, m - 1),     to: endOfMonth(y, m - 1) },
    { id: 'last-30',      label: 'Last 30 days',   from: new Date(TODAY.getTime() - 30 * 86400000), to: TODAY },
    { id: 'this-quarter', label: 'This quarter',   from: startOfQuarter(y, q),       to: endOfQuarter(y, q) },
    { id: 'last-quarter', label: 'Last quarter',   from: q === 0 ? startOfQuarter(y - 1, 3) : startOfQuarter(y, q - 1),
                                                    to:   q === 0 ? endOfQuarter(y - 1, 3)   : endOfQuarter(y, q - 1) },
    { id: 'ytd',          label: 'Year to date',   from: startOfYear(y),             to: TODAY },
    { id: 'this-year',    label: 'This year',      from: startOfYear(y),             to: endOfYear(y) },
    { id: 'last-year',    label: 'Last year',      from: startOfYear(y - 1),         to: endOfYear(y - 1) },
    { id: 'all',          label: 'All time',       from: null,                        to: null },
  ];
}

type PickerMode = 'preset' | 'month' | 'quarter' | 'custom';

export default function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>('preset');
  const wrapRef = useRef<HTMLDivElement>(null);
  const presets = buildPresets();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const apply = (next: Period) => {
    onChange(next);
    setOpen(false);
  };

  const [viewYear, setViewYear] = useState(TODAY.getFullYear());

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button className="btn period-trigger" onClick={() => setOpen(!open)}>
        <CalGlyph />
        <span style={{ marginLeft: 2 }}>{value.label}</span>
        <IconChevron dir={open ? 'up' : 'down'} size={10} />
      </button>

      {open && (
        <div className="period-pop">
          <div className="period-tabs">
            <button className={mode === 'preset'  ? 'on' : ''} onClick={() => setMode('preset')}>Presets</button>
            <button className={mode === 'month'   ? 'on' : ''} onClick={() => setMode('month')}>Month</button>
            <button className={mode === 'quarter' ? 'on' : ''} onClick={() => setMode('quarter')}>Quarter</button>
            <button className={mode === 'custom'  ? 'on' : ''} onClick={() => setMode('custom')}>Custom</button>
          </div>

          <div className="period-body">
            {mode === 'preset' && (
              <div className="period-presets">
                {presets.map((p) => {
                  const sel = value.preset === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`period-preset ${sel ? 'on' : ''}`}
                      onClick={() => apply({ from: p.from, to: p.to, label: p.label, preset: p.id })}
                    >
                      <span>{p.label}</span>
                      <span className="period-preset-range">
                        {p.from ? fmtRange(p.from, p.to) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {mode === 'month' && (
              <>
                <YearStepper year={viewYear} setYear={setViewYear} />
                <div className="period-month-grid">
                  {MONTHS.map((m, idx) => {
                    const from = startOfMonth(viewYear, idx);
                    const to = endOfMonth(viewYear, idx);
                    const isFuture = from.getTime() > TODAY.getTime();
                    const sel = value.from != null && value.to != null
                      && value.from.getFullYear() === viewYear
                      && value.from.getMonth() === idx
                      && value.to.getMonth() === idx
                      && value.preset === 'month';
                    return (
                      <button
                        key={m}
                        disabled={isFuture}
                        className={`period-month ${sel ? 'on' : ''} ${isFuture ? 'disabled' : ''}`}
                        onClick={() => apply({
                          from, to,
                          label: `${m} ${viewYear}`,
                          preset: 'month',
                        })}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {mode === 'quarter' && (
              <>
                <YearStepper year={viewYear} setYear={setViewYear} />
                <div className="period-quarter-grid">
                  {[0, 1, 2, 3].map((q) => {
                    const from = startOfQuarter(viewYear, q);
                    const to = endOfQuarter(viewYear, q);
                    const isFuture = from.getTime() > TODAY.getTime();
                    const sel = value.preset === 'quarter'
                      && value.from != null && value.from.getFullYear() === viewYear
                      && Math.floor(value.from.getMonth() / 3) === q;
                    return (
                      <button
                        key={q}
                        disabled={isFuture}
                        className={`period-quarter ${sel ? 'on' : ''} ${isFuture ? 'disabled' : ''}`}
                        onClick={() => apply({
                          from, to,
                          label: `Q${q + 1} ${viewYear}`,
                          preset: 'quarter',
                        })}
                      >
                        <div className="period-quarter-name">Q{q + 1}</div>
                        <div className="period-quarter-sub">{MONTHS[q * 3]}–{MONTHS[q * 3 + 2]}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="period-year-row">
                  {[viewYear - 1, viewYear, viewYear + 1].map((y) => {
                    const from = startOfYear(y);
                    const to = endOfYear(y);
                    const isFuture = from.getTime() > TODAY.getTime();
                    return (
                      <button
                        key={y}
                        disabled={isFuture}
                        className={`period-fullyear ${value.preset === 'year' && value.from && value.from.getFullYear() === y ? 'on' : ''}`}
                        onClick={() => apply({ from, to, label: `${y}`, preset: 'year' })}
                      >
                        Full year {y}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {mode === 'custom' && (
              <CustomRange value={value} onApply={apply} />
            )}
          </div>

          <div className="period-foot">
            <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>
              {value.from ? fmtRange(value.from, value.to) : 'No filter applied'}
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => apply({ from: null, to: null, label: 'All time', preset: 'all' })}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function YearStepper({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  return (
    <div className="period-year-stepper">
      <button onClick={() => setYear(year - 1)}><IconChevron dir="left" size={10} /></button>
      <span>{year}</span>
      <button onClick={() => setYear(year + 1)}><IconChevron dir="right" size={10} /></button>
    </div>
  );
}

function CustomRange({ value, onApply }: { value: Period; onApply: (p: Period) => void }) {
  const [fromM, setFromM] = useState(value.from ? value.from.getMonth() : 0);
  const [fromY, setFromY] = useState(value.from ? value.from.getFullYear() : TODAY.getFullYear());
  const [toM,   setToM]   = useState(value.to   ? value.to.getMonth()   : TODAY.getMonth());
  const [toY,   setToY]   = useState(value.to   ? value.to.getFullYear() : TODAY.getFullYear());

  const submit = () => {
    const from = startOfMonth(fromY, fromM);
    const to = endOfMonth(toY, toM);
    if (to < from) return;
    onApply({
      from, to,
      label: fmtRange(from, to),
      preset: 'custom',
    });
  };

  return (
    <div className="period-custom">
      <div className="period-custom-row">
        <label>From</label>
        <select value={fromM} onChange={(e) => setFromM(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={fromY} onChange={(e) => setFromY(+e.target.value)}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="period-custom-row">
        <label>To</label>
        <select value={toM} onChange={(e) => setToM(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={toY} onChange={(e) => setToY(+e.target.value)}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" onClick={submit} style={{ width: '100%', justifyContent: 'center' }}>
        Apply range
      </button>
    </div>
  );
}
