// Pipeline orchestrator — the on-demand engine (DESIGN.md §3).
//
// One call: Jolene brings a company (name or URL) -> we dedupe-check Cosmos ->
// gather VERIFIED facts -> classify hiring -> write the packet (from facts only) ->
// persist. Status is driven by the REAL signal, never assumed.
//
// Returns everything the UI needs, including whether this was a cache hit
// ("we already have this one") vs freshly researched.

import { normalizeDomain, Company } from "./company";
import { getCompany, getOrCreateCompany, upsertCompany } from "./repo";
import { gather } from "./gather";
import { classifyHiring } from "./classify";
import { generatePacket, Packet as WrittenPacket } from "./packet";
import type { Tier } from "./llm";
import { FactsBundle, bundleSources, factsOf } from "./facts";

export interface ScoutResult {
  company: Company;
  cached: boolean;          // did it already exist in the DB?
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
  const cached = Boolean(existing);
  const { company } = existing
    ? { company: existing }
    : await getOrCreateCompany(domain, opts.name);

  if (opts.name && !company.name) company.name = opts.name;

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
    boardUrl: opts.boardUrl,
    knownAbout,
  });

  const atsFound = fetch.ok && fetch.roles.length > 0;

  // 3. Classify hiring from the real role facts (Luna).
  const roleClaims = factsOf(bundle, "role").map((f) => f.claim).join("\n");
  let isHiring = atsFound; // structured roles present = hiring, by definition
  let roleTitles: string[] = fetch.roles.map((r) => r.title).filter((t) => t.trim().length > 2);
  if (atsFound) {
    try {
      const v = await classifyHiring(company.name ?? domain, roleClaims);
      isHiring = v.isHiring;
      if (v.roles?.length) roleTitles = v.roles;
    } catch {
      /* keep structured-signal default */
    }
  }

  // 4. Write the packet (from facts only). Skip if truly nothing to say.
  let packet: WrittenPacket | null = null;
  if (atsFound) {
    packet = await generatePacket(bundle, opts.tier ?? "cheap");
  }

  // 5. Persist — status driven by real signal.
  company.hiring = {
    isHiring,
    roles: roleTitles.slice(0, 20),
    source: fetch.boardUrl.startsWith("http") ? fetch.boardUrl : `${fetch.ats}:${fetch.slug ?? ""}`,
    seenAt: atsFound ? new Date().toISOString() : company.hiring.seenAt,
  };
  if (isHiring && company.status === "new") company.status = "hiring";
  else if (!isHiring && company.status === "new") company.status = "watching";

  if (packet) {
    company.packet = {
      fast: packet as unknown as Record<string, unknown>,
      deep: company.packet.deep,
      generatedAt: packet.generatedAt,
    };
  }
  company.sources = bundleSources(bundle).map((s) => s.ref);
  company.lastCheckedAt = new Date().toISOString();

  const saved = await upsertCompany(company);

  return { company: saved, cached, bundle, packet, atsFound };
}
