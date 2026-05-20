import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app" style={{ gridTemplateColumns: '220px 1fr' }}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DF</div>
          <div>
            <div className="brand-name">Admin</div>
            <div className="brand-sub">Dev Fund Console</div>
          </div>
        </div>
        <div className="nav">
          <div className="nav-section">Admin</div>
          <Link href="/admin" className="nav-item"><span>Overview</span></Link>
          <Link href="/admin/proposals" className="nav-item"><span>Edit proposals</span></Link>
          <Link href="/admin/budget" className="nav-item"><span>Budget periods</span></Link>
          <Link href="/admin/sync" className="nav-item"><span>Sync management</span></Link>
          <Link href="/admin/users" className="nav-item"><span>User roles</span></Link>
          <Link href="/admin/audit" className="nav-item"><span>Audit log</span></Link>
          <div className="nav-section">Back</div>
          <Link href="/" className="nav-item"><span>← Dashboard</span></Link>
        </div>
      </aside>
      <main className="main" style={{ gridColumn: '2' }}>{children}</main>
    </div>
  );
}
