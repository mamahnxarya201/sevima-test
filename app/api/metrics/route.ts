/**
 * GET /api/metrics
 *
 * Prometheus scrape endpoint. Public (no auth) — Prometheus container
 * calls this on an interval. Protected by network-level access only.
 */
import { NextResponse } from 'next/server';
import { registry } from '@/lib/metrics/prometheus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const metrics = await registry.metrics();
  return new NextResponse(metrics, {
    status: 200,
    headers: { 'Content-Type': registry.contentType },
  });
}
