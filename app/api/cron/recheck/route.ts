import { NextRequest, NextResponse } from "next/server";
import { listDueForRecheck } from "@/lib/repo";
import { scout } from "@/lib/scout";
import { cronAuthed } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel: allow the loop room

// Re-check companies whose hiring signal has gone stale.
// Keeps the queue honest: a company that stopped hiring drops out,
// a fresh signal bumps it back up. Runs on a schedule (see vercel.json).
//
// Guardrails:
//  - CRON_SECRET gate (Vercel sends Authorization: Bearer <secret>)
//  - capped batch per run (budget + rate-limit safety)
//  - paced (gap between companies) so we never burst the ATS or the model
//  - never throws: a bad company is logged and skipped, loop continues

const DAYS_STALE = 14;   // recheck window
const BATCH = 12;        // companies per run — small, cheap, safe
const GAP_MS = 1500;     // pacing between companies

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  if (!cronAuthed(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  // Optional ?days= override for manual re-sweeps / testing; scheduled runs use
  // the default window. Clamped to >= 0.
  const daysParam = new URL(req.url).searchParams.get("days");
  const days = daysParam != null ? Math.max(0, Number(daysParam) || 0) : DAYS_STALE;
  let due;
  try {
    due = await listDueForRecheck(days, BATCH);
  } catch (e: any) {
    return NextResponse.json({ ok: false, stage: "list", error: e.message }, { status: 500 });
  }

  const results: { domain: string; ok: boolean; status?: string; hiring?: boolean; error?: string }[] = [];
  for (const c of due) {
    try {
      // Cheap tier for bulk rechecks — we only spend Terra on a real hot lead
      // via the on-demand path, not the sweep.
      const r = await scout(c.domain, { force: true, tier: "cheap" });
      results.push({
        domain: c.domain,
        ok: true,
        status: r.company.status,
        hiring: r.company.hiring.isHiring,
      });
    } catch (e: any) {
      results.push({ domain: c.domain, ok: false, error: e?.message ?? String(e) });
    }
    await sleep(GAP_MS);
  }

  const rechecked = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const hiring = results.filter((r) => r.hiring).length;

  return NextResponse.json({
    ok: true,
    kind: "recheck",
    tookMs: Date.now() - started,
    rechecked,
    hiring,
    failed,
    results,
  });
}
