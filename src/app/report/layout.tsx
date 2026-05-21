// Report layout — light, no dashboard chrome. Overrides the dark theme set on
// <html> so the printable report renders correctly on screen and on paper.
export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', minHeight: '100vh', colorScheme: 'light' }}>
      {children}
    </div>
  );
}
