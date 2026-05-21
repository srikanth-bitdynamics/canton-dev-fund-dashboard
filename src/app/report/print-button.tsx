'use client';

export default function PrintButton() {
  return (
    <button className="rep-print-btn" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
