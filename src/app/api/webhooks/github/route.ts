import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncProposals } from '@/lib/db/sync';

export const maxDuration = 60;

/**
 * GitHub webhook receiver.
 *
 * Configure on the canton-foundation/canton-dev-fund repo:
 *   Settings → Webhooks → Add webhook
 *   Payload URL: https://<your-app>.vercel.app/api/webhooks/github
 *   Content type: application/json
 *   Secret: matches GITHUB_WEBHOOK_SECRET env var
 *   Events: Pull requests, Issues, Pushes
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const event = req.headers.get('x-github-event');
  const signature = req.headers.get('x-hub-signature-256');
  const body = await req.text();

  // Verify signature if secret is configured
  if (secret) {
    if (!signature) {
      return NextResponse.json({ error: 'missing signature' }, { status: 401 });
    }
    const hmac = crypto.createHmac('sha256', secret);
    const expected = `sha256=${hmac.update(body).digest('hex')}`;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  // Triggers: PR events (label/state changes) and pushes to main (proposal file edits)
  const shouldSync = ['pull_request', 'issues', 'push'].includes(event || '');
  if (shouldSync) {
    // Fire and forget — webhooks should respond fast
    syncProposals()
      .then((r) => console.log('Webhook sync:', r.approved_synced, 'approved,', r.pipeline_synced, 'pipeline'))
      .catch((e) => console.error('Webhook sync failed:', e));
  }

  return NextResponse.json({ ok: true, event, triggered_sync: shouldSync });
}
