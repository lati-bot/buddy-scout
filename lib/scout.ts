// Pipeline orchestrator — the on-demand engine (DESIGN.md §3).
//
// One call: Jolene brings a company (name or URL) -> we dedupe-check Cosmos ->
// gather VERIFIED facts -> classify hiring -> write the packet (from facts only) ->
// persist. Status is driven by the REAL signal, never assumed.
//
// Returns everything the UI needs, including whether this was a cache hit
// ("we already have this one") vs freshly researched.

import { assessmentRoleFit, normalizeDomain, Company } from "./company";
import { getCompany, getOrCreateCompany, mutateCompany } from "./repo";
import { gather } from "./gather";
import { applyResearchUpdate, hasFreshSuccessfulCheck } from "./research-state";
import { generatePacket, Packet as WrittenPacket } from "./packet";
import type { Tier } from "./llm";
import { FactsBundle, bundleSources, newBundle } from "./facts";

export interface ScoutResult {
  company: Company;
  cached: boolean;          // did this call reuse a fresh persisted result?
  bundle: FactsBundle;
  packet: WrittenPacket | null;
  atsFound: boolean;
}

/**
 * Research (or re-research) a company end to end.
 * @param input      company name or URL/domain
 * @param opts.name  optional display name if input was a URL
 * @param opts.boardUrl optional known ATS/careers URL
 * @param opts.tier  writer tier (default cheap=Luna; use "mid"=Terra for hot leads)
 * @param opts.force re-research even if cached & fresh
 */
export async function scout(
  input: string,
  opts: { name?: string; boardUrl?: string; tier?: Tier; force?: boolean } = {}
): Promise<ScoutResult> {
  const domain = normalizeDomain(input);

  // 1. Dedupe gate — do we already have this one?
  const existing = await getCompany(domain);
  const { company } = existing
    ? { company: existing }
    : await getOrCreateCompany(domain, opts.name);

  if (opts.name && !company.name) company.name = opts.name;

  // A normal revisit should be instant. Scheduled/manual forced checks bypass this.
  if (existing && hasFreshSuccessfulCheck(company) && !opts.force) {
    return {
      company,
      cached: true,
      bundle: newBundle(domain, company.name ?? domain),
      packet: (company.packet.fast as unknown as WrittenPacket | null) ?? null,
      atsFound: company.lastCheck?.status === "confirmed-hiring",
    };
  }

  // 2. Gather verified facts (ATS roles + heat signal, all sourced).
  const knownAbout = company.description
    ? {
        text: company.description,
        source: { kind: "user" as const, ref: "record", fetchedAt: new Date().toISOString() },
      }
    : opts.name || company.name
    ? undefined
    : undefined;

  const { bundle, fetch } = await gather({
    domain,
    companyName: company.name ?? domain,
    boardUrl: opts.boardUrl ?? (company.hiring.source?.startsWith("http") ? company.hiring.source : undefined),
    knownAbout,
  });

  const atsFound = fetch.ok && fetch.roles.length > 0;

  // Structured API roles are authoritative; a classifier must not invent titles or veto them.
  const isHiring = atsFound;
  const roleTitles = fetch.roles.map(r => r.title).filter(t => t.trim().length > 2);

  // 4. Write the packet (from facts only). Skip if truly nothing to say.
  let packet: WrittenPacket | null = null;
  if (atsFound) {
    try { packet = await generatePacket(bundle, opts.tier ?? "cheap"); }
    catch { /* Persist the hiring check even when the writer fails; never retain old copy. */ }
  }

  // Product qualification is deterministic, not left to prose generation.
  // Executive-only boards are hiring, but they are not Buddy's assessment ICP.
  const roleFit = assessmentRoleFit(roleTitles);
  if (packet && roleFit.leadershipOnly) {
    packet.verdict = {
      call: "skip",
      line: "Skip for now. Every listed opening is VP, head, director, or C-suite level; Buddy is a stronger fit for entry-through-senior and founding-role hiring.",
    };
  }

  // 5. Persist. A failed lookup is UNKNOWN, not proof that hiring stopped.
  const now = new Date().toISOString();
  if (fetch.ok) {
    company.hiring = {
      isHiring,
      roles: roleTitles.slice(0, 20),
      source: fetch.boardUrl.startsWith("http") ? fetch.boardUrl : `${fetch.ats}:${fetch.slug ?? ""}`,
      seenAt: now,
    };
    company.lastCheck = {
      status: atsFound ? "confirmed-hiring" : "confirmed-empty",
      checkedAt: now,
      error: null,
    };
    if (isHiring && (company.status === "new" || company.status === "watching")) company.status = "hiring";
    else if (!isHiring && company.status === "new") company.status = "watching";
    company.packet = { fast: null, deep: null, generatedAt: null };
  } else {
    company.lastCheck = {
      status: "unavailable",
      checkedAt: now,
      error: fetch.error ?? "Hiring source unavailable",
    };
    if (!existing && company.status === "new") company.status = "watching";
  }

  if (packet) {
    company.packet = {
      fast: packet as unknown as Record<string, unknown>,
      deep: company.packet.deep,
      generatedAt: packet.generatedAt,
    };
  }
  company.sources = bundleSources(bundle).map((s) => s.ref);
  company.lastCheckedAt = now;

  const saved = await mutateCompany(domain, current => applyResearchUpdate(current, {
    hiring: company.hiring, lastCheck: company.lastCheck, lastCheckedAt: company.lastCheckedAt,
    packet: company.packet, sources: company.sources,
  }));

  const responsePacket = saved.lastCheck?.status === "confirmed-hiring"
    ? (saved.packet.fast as unknown as WrittenPacket | null) ?? null : null;
  return { company: saved, cached: false, bundle, packet: responsePacket, atsFound };
}
