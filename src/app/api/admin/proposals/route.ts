import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { desc } from 'drizzle-orm';

export async function GET() {
  const proposals = db
    .select({
      id: schema.proposals.id,
      title: schema.proposals.title,
      author: schema.proposals.author,
      status: schema.proposals.status,
      category: schema.proposals.category,
      total_funding_cc: schema.proposals.total_funding_cc,
      github_pr_number: schema.proposals.github_pr_number,
      in_repo: schema.proposals.in_repo,
      updated_at: schema.proposals.updated_at,
    })
    .from(schema.proposals)
    .orderBy(desc(schema.proposals.updated_at))
    .all();
  return NextResponse.json({ proposals });
}
