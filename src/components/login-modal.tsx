'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { IconGitHub } from '@/components/ui/icons';

interface LoginModalProps {
  onClose: () => void;
  // Kept for backward compat with mock flow — production calls signIn directly
  onLogin?: (user: { handle: string; initials: string; team: string }) => void;
  mockMode?: boolean;
}

export default function LoginModal({ onClose, onLogin, mockMode }: LoginModalProps) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (mockMode && onLogin) {
      // Dev fallback: instant fake login (used when ?mock=1)
      onLogin({ handle: 'demo-user', initials: 'DU', team: 'tech-ops-committee' });
      return;
    }
    if (!process.env.NEXT_PUBLIC_AUTH_ENABLED && !window.location.search.includes('auth=1')) {
      // Auth not configured yet — show helpful message
      alert(
        'GitHub OAuth not configured.\n\n' +
          '1. Create an OAuth App at https://github.com/settings/developers\n' +
          '2. Set callback URL: http://localhost:3000/api/auth/callback/github\n' +
          '3. Add AUTH_GITHUB_ID + AUTH_GITHUB_SECRET to .env.local\n' +
          '4. Restart the dev server\n\n' +
          'Or use ?mock=1 to test with fake data + fake login.',
      );
      return;
    }
    setLoading(true);
    await signIn('github', { callbackUrl: '/' });
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Admin sign in</h3>
        <p>
          Authenticate via GitHub. <strong style={{ color: 'var(--ink-1)' }}>hythloda</strong>
          {' '}and <strong style={{ color: 'var(--ink-1)' }}>srikanth-bitdynamics</strong> have admin access.
          Members of the canton-foundation org get committee_member access.
          Admins can promote others via Admin → User roles.
        </p>
        <button className="gh-btn" onClick={handleSignIn} disabled={loading}>
          <IconGitHub size={16} /> {loading ? 'Redirecting…' : 'Continue with GitHub'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 12, textAlign: 'center' }}>
          Scopes requested: <code style={{ fontFamily: 'var(--font-mono)' }}>read:user · read:org · read:project</code>
        </div>
      </div>
    </div>
  );
}
