import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "@/lib/repo";
import { scout } from "@/lib/scout";
import { cronAuthed } from "@/lib/cron";
import { normalizeDomain } from "@/lib/company";
import seed from "@/data/nyc.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fill the queue by itself: research seed companies we don't have yet.
// This is what turns Buddy Scout from a lookup tool into a standing pipeline —
// Jolene opens the Queue and finds hot leads already worked up, without typing
// a single name.
//
// v1 source = the curated seed list (data/nyc.json). Future: harvest fresh
// companies straight off ATS boards + funding feeds (DESIGN.md §4.5). Kept
// deliberately small and additive so this is safe to run unattended.
//
// Guardrails: CRON_SECRET gate, capped batch, paced, dedupe-first (skip anything
// already in Cosmos), never throws.

const BATCH = 8;      // new companies per run
const GAP_MS = 1800;  // pacing

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Seed = { company: string; domain: string };

export async function GET(req: NextRequest) {
  if (!cronAuthed(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const list = seed as Seed[];

  // Find seed companies not yet researched (dedupe against Cosmos).
  const fresh: Seed[] = [];
  for (const s of list) {
    if (fresh.length >= BATCH) break;
    try {
      const existing = await getCompany(normalizeDomain(s.domain));
      if (!existing) fresh.push(s);
    } catch {
      // If the dedupe read fails, skip rather than risk a duplicate research spend.
    }
  }

  const results: { domain: string; ok: boolean; status?: string; hiring?: boolean; error?: string }[] = [];
  for (const s of fresh) {
    try {
      const r = await scout(s.domain, { name: s.company, force: false, tier: "cheap" });
      results.push({
        domain: s.domain,
        ok: true,
        status: r.company.status,
        hiring: r.company.hiring.isHiring,
      });
    } catch (e: any) {
      results.push({ domain: s.domain, ok: false, error: e?.message ?? String(e) });
    }
    await sleep(GAP_MS);
  }

  const added = results.filter((r) => r.ok).length;
  const hiring = results.filter((r) => r.hiring).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    kind: "collect",
    tookMs: Date.now() - started,
    considered: fresh.length,
    added,
    hiring,
    failed,
    results,
  });
}
