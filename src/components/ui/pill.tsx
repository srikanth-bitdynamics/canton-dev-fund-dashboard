import type { CSSProperties, ReactNode } from 'react';

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
