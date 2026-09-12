// Buyer Card — the deep "who do I approach, and what's my best path this week?" pass.
//
// This is DELIBERATELY not part of the fast scout. It's a slow, per-company research
// pass Jolene runs on a company she cares about ("Find the buyer →"). It spends real
// effort only when it's worth it.
//
// THE JOB (reasoned as Jolene, a rep working NYC + Chicago, selling Buddy — an AI
// recruiter that interviews every applicant against the role and employer criteria):
//   Turn a company into a SPECIFIC HUMAN she can plausibly reach this week.
//
// Three layers, in effectiveness order:
//   1. BUYER(S)   — rank the person who owns the actual hiring-volume pain in this
//                   company's context. From REAL sources only, labeled confirmed vs likely.
//   2. WARM PATH  — her unfair edge: does she (or the network) already know this buyer,
//                   or someone at the company? Warm always beats cold.
//   3. LOCATION   — where's the buyer, relative to her two bases (NYC / Chicago)?
//                   Company HQ almost always gettable; person's city when public;
//                   founder-likely-at-HQ is a LABELED assumption, never a fake fact.
//
// INVARIANT (same as the rest of the app): zero unsourced claims. Every buyer name,
// title, and city carries a source Jolene can click. If we can't source it, we say
// "likely" and show the reasoning — we never dress a guess as a fact.

import { complete } from "./llm";
import { connectionsAtCompany, ownersOf, companyKey, type Connection } from "./connections";
import type { Company } from "./company";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type BuyerConfidence = "confirmed" | "likely" | "thin";

export interface BuyerCandidate {
  name: string | null;          // null = "role identified, person not yet named"
  title: string;                // the role as found/inferred
  roleFit: "founder" | "talent" | "eng" | "functional" | "other";
  why: string;                  // one line: why THIS person, for Buddy
  city: string | null;          // person's city if public; else null
  cityBasis: "public" | "assumed-hq" | "unknown";
  confidence: BuyerConfidence;
  sourceUrl: string | null;     // where the name/title came from
  warm: BuyerWarm | null;       // do we know them / someone at the company?
}

export interface BuyerWarm {
  direct: boolean;              // is the buyer THEMSELF in the network?
  directOwners: string[];       // which team members know the buyer directly
  count: number;                // how many people we know at the company
  owners: string[];             // which team members reach this company at all
  best: Array<{ name: string; position: string; url: string; strength: number; owner: string }>;
}

export interface Location {
  companyHq: string | null;
  companyHqSource: string | null;
  nearBase: "nyc" | "chicago" | null;  // is the buyer/HQ near one of Jolene's bases?
  note: string;                         // human sentence for the card
}

export interface BuyerCard {
  companyName: string;
  domain: string;
  buyers: BuyerCandidate[];     // ranked, best-approach first
  location: Location;
  warmSummary: string;          // top-line warm-path sentence
  confidence: BuyerConfidence;  // overall floor
  sources: string[];            // every URL cited, deduped
  generatedAt: string;
  notes: string[];              // honesty notes ("founder city assumed from HQ", etc.)
}

export interface BuyerContext {
  size?: string | null;
  stage?: string | null;
  hiringRoles?: string[];
}

/* ------------------------------------------------------------------ *
 * Location — Jolene's two home bases, matched honestly.
 * ------------------------------------------------------------------ */

// Metro aliases so "Brooklyn", "Jersey City", "Evanston" etc. still count as near-base.
const NYC_HINTS = /\b(new york|nyc|manhattan|brooklyn|queens|bronx|jersey city|newark|hoboken|new york city|ny\b)/i;
const CHI_HINTS = /\b(chicago|evanston|oak park|naperville|schaumburg|cook county|chicagoland|il\b)/i;

export function baseFor(city: string | null | undefined): "nyc" | "chicago" | null {
  if (!city) return null;
  if (NYC_HINTS.test(city)) return "nyc";
  if (CHI_HINTS.test(city)) return "chicago";
  return null;
}

/* ------------------------------------------------------------------ *
 * Buyer ranking heuristics — who's the RIGHT person for Buddy.
 * ------------------------------------------------------------------ */

const RX_FOUNDER = /\b(founder|co-?founder|ceo|chief executive)\b/i;
const RX_TALENT = /\b(talent|recruit|recruiting|people|head of people|chief people|hr|human resources|staffing)\b/i;
const RX_ENG = /\b(cto|chief technology|vp eng|vp of eng|head of eng|engineering lead|head of engineering|technical co-?founder)\b/i;
const RX_FUNCTIONAL = /\b(chief revenue|cro|vp sales|head of sales|sales leader|chief marketing|cmo|vp marketing|head of marketing|chief operating|coo|vp operations|head of operations|chief product|cpo|vp product|head of product|general manager)\b/i;

export function roleFitOf(title: string): BuyerCandidate["roleFit"] {
  const t = title || "";
  if (RX_FOUNDER.test(t)) return "founder";
  if (RX_TALENT.test(t)) return "talent";
  if (RX_ENG.test(t)) return "eng";
  if (RX_FUNCTIONAL.test(t)) return "functional";
  return "other";
}

/** Rank buyers contextually. Warmth breaks close calls; it does not turn a weak contact into the buyer. */
type ScoredCandidate = BuyerCandidate & { nearBaseScore?: number };

export function rankBuyers(cands: ScoredCandidate[], context: BuyerContext = {}): ScoredCandidate[] {
  const roles = context.hiringRoles ?? [];
  const engCount = roles.filter((r) => /engineer|developer|software|data|security|technical|devops|infrastructure/i.test(r)).length;
  const engHeavy = roles.length >= 2 && engCount / roles.length >= 0.5;
  const hasTalentBuyer = cands.some((b) => b.roleFit === "talent" && b.name);
  const sizeText = context.size ?? "";
  const smallCompany = /\b(1[-–]10|11[-–]50|seed|pre-seed|tiny|small)\b/i.test(`${sizeText} ${context.stage ?? ""}`);
  const dominantFunction = dominantHiringFunction(roles);
  const fitScore = (b: ScoredCandidate): number => {
    if (b.roleFit === "talent") return hasTalentBuyer && (roles.length >= 8 || !smallCompany) ? 46 : 32;
    if (b.roleFit === "founder") return smallCompany || !hasTalentBuyer ? 40 : 26;
    if (b.roleFit === "eng") return engHeavy ? 44 : 18;
    if (b.roleFit === "functional") return dominantFunction && titleMatchesFunction(b.title, dominantFunction) ? 44 : 16;
    return 0;
  };
  const score = (b: ScoredCandidate): number => {
    let s = fitScore(b);
    if (b.warm?.direct) s += 18;
    else if (b.warm && b.warm.count > 0) s += 5;
    if (b.confidence === "confirmed") s += 8;
    else if (b.confidence === "likely") s += 3;
    return s;
  };
  return [...cands].sort((a, b) => score(b) - score(a));
}

/* ------------------------------------------------------------------ *
 * The research pass.
 * ------------------------------------------------------------------ */

type WebHit = { url: string; title: string; description?: string };
type WebSearch = (q: string) => Promise<WebHit[]>;

/**
 * Build a Buyer Card for a company. Pure orchestration; web search + page fetch are
 * injected so this stays testable and the route owns the network shims.
 *
 * @param company   the company record (name, domain, location if known)
 * @param webSearch injected search fn (returns public hits)
 * @param fetchPage injected page fetch (returns cleaned text + final url)
 */
export async function buildBuyerCard(
  company: Pick<Company, "name" | "domain" | "location"> & BuyerContext,
  webSearch: WebSearch,
  fetchPage: (url: string) => Promise<{ url: string; text: string } | null>
): Promise<BuyerCard> {
  const name = company.name ?? company.domain;
  const domain = company.domain;
  const notes: string[] = [];
  const sourceSet = new Set<string>();

  // --- 1. WARM PATH (free, instant, our edge — do it first). --------------
  const conns = await connectionsAtCompany(name);
  // Backfill-safe: connections uploaded before the multi-owner field default to "Tomi".
  for (const c of conns) if (!c.owner) { c.owner = "Tomi"; c.ownerKey = "tomi"; }
  const teamOwners = ownersOf(conns);
  const warmTop = conns.slice(0, 5).map((c) => ({
    name: c.name,
    position: c.position,
    url: c.url,
    strength: c.strength,
    owner: c.owner,
  }));
  const companyWarm: BuyerWarm | null = conns.length
    ? { direct: false, directOwners: [], count: conns.length, owners: teamOwners, best: warmTop }
    : null;

  // --- 2. FIND THE BUYER — real sources only. ---------------------------
  // Search public web for the company's decision-makers. We pull hits from the
  // company's own site (team/about/leadership) + LinkedIn + press, then let the
  // model EXTRACT names/titles/cities FROM THE FETCHED TEXT ONLY (never invent).
  const queries = [
    `${name} "head of talent" OR "head of recruiting" OR "head of people"`,
    `${name} founder CEO`,
    ...(isEngineeringHeavy(company.hiringRoles ?? []) ? [`${name} CTO OR "head of engineering"`] : []),
    ...functionalBuyerQueries(name, company.hiringRoles ?? []),
    `${name} team leadership about`,
  ];

  const hits: WebHit[] = [];
  for (const q of queries) {
    try {
      const r = await webSearch(q);
      // Keep a small quota per persona query so one productive query cannot crowd
      // every other possible buyer out of the evidence window.
      for (const h of r.slice(0, 2)) if (!hits.find((x) => x.url === h.url)) hits.push(h);
    } catch { /* keep going */ }
  }

  // Prefer the company's own pages + LinkedIn for extraction (most trustworthy).
  const preferred = hits
    .filter((h) => h.url.includes(domain) || /linkedin\.com\/(in|company)/.test(h.url) || /about|team|leadership|people|founder/i.test(h.url))
    .slice(0, 8);
  const pool = (preferred.length ? preferred : hits).slice(0, 8);

  // Fetch page text for the strongest candidates so extraction is grounded.
  const pages: Array<{ url: string; text: string }> = [];
  for (const h of pool) {
    const p = await fetchPage(h.url);
    if (p && p.text && p.text.length > 40) {
      pages.push({ url: p.url, text: p.text.slice(0, 4000) });
      sourceSet.add(p.url);
    } else {
      // even without body text, the search snippet is a (thin) source
      sourceSet.add(h.url);
    }
  }

  // Compose the grounded evidence block. The model may ONLY use this.
  const evidence = [
    ...pages.map((p, i) => `[S${i + 1}] ${p.url}\n${p.text}`),
    ...pool
      .filter((h) => !pages.find((p) => p.url === h.url))
      .map((h, i) => `[T${i + 1}] ${h.url}\n${h.title}${h.description ? " — " + h.description : ""}`),
  ].join("\n\n---\n\n");

  let extracted: RawBuyer[] = [];
  if (evidence.trim()) {
    try {
      extracted = await extractBuyers(name, evidence, company);
    } catch (e: any) {
      notes.push(`Buyer extraction failed (${e?.message ?? "model error"}); showing role targets only.`);
    }
  } else {
    notes.push("No public leadership pages found — showing role targets to aim for, unnamed.");
  }

  // --- 3. Turn raw extractions into ranked candidates + attach warm/location. ---
  const hqGuess = company.location ?? extracted.find((e) => e.companyHq)?.companyHq ?? null;
  const hqSource = extracted.find((e) => e.companyHq && e.sourceUrl)?.sourceUrl ?? null;

  const cands: (BuyerCandidate & { nearBaseScore?: number })[] = [];
  for (const e of extracted) {
    const fit = roleFitOf(e.title || "");
    // Is this exact person in the network — and if so, WHO on the team knows them?
    const directMatches = conns.filter((c) => sameName(c.name, e.name));
    let city = e.city ?? null;
    let cityBasis: BuyerCandidate["cityBasis"] = city ? "public" : "unknown";
    // Founder-likely-at-HQ assumption — LABELED, never presented as fact.
    if (!city && fit === "founder" && hqGuess) {
      city = hqGuess;
      cityBasis = "assumed-hq";
      notes.push(`${e.name ?? "Founder"}'s city assumed from company HQ (${hqGuess}) — not individually confirmed.`);
    }
    const near = baseFor(city);
    const warm: BuyerWarm | null = directMatches.length
      ? { direct: true, directOwners: [...new Set(directMatches.map((c) => c.owner))], count: conns.length, owners: teamOwners, best: warmTop }
      : companyWarm;

    cands.push({
      name: e.name ?? null,
      title: e.title || "(role target)",
      roleFit: fit,
      why: e.why || whyForFit(fit),
      city,
      cityBasis,
      confidence: e.name ? (e.sourceUrl ? "confirmed" : "likely") : "thin",
      sourceUrl: e.sourceUrl ?? null,
      warm,
      nearBaseScore: near ? 20 : 0,
    });
    if (e.sourceUrl) sourceSet.add(e.sourceUrl);
  }

  // If we found nobody by name, still hand Jolene the role targets to aim for.
  if (!cands.length) {
    for (const fit of fallbackFits(company)) {
      cands.push({
        name: null,
        title: targetTitle(fit),
        roleFit: fit,
        why: whyForFit(fit),
        city: fit === "founder" && hqGuess ? hqGuess : null,
        cityBasis: fit === "founder" && hqGuess ? "assumed-hq" : "unknown",
        confidence: "thin",
        sourceUrl: null,
        warm: companyWarm,
        nearBaseScore: baseFor(fit === "founder" ? hqGuess : null) ? 20 : 0,
      });
    }
  }

  const ranked = rankBuyers(cands, company).map(({ nearBaseScore, ...b }) => b);

  // --- 4. Location summary (relative to her two bases). -----------------
  const topNear = ranked.map((b) => baseFor(b.city)).find(Boolean) ?? baseFor(hqGuess);
  const location: Location = {
    companyHq: hqGuess,
    companyHqSource: hqSource,
    nearBase: topNear ?? null,
    note: locationNote(hqGuess, topNear ?? null, conns.length),
  };

  // --- 5. Warm summary + overall confidence floor. ---------------------
  // Multi-owner: name WHO on the team holds the warm path so Jolene knows whether
  // it's her own intro (just reach out) or someone else's (ask them to broker).
  const directBuyer = ranked.find((b) => b.warm?.direct && b.roleFit !== "other");
  const directOwners = directBuyer?.warm?.directOwners ?? [];
  const fmtOwners = (o: string[]) =>
    o.length === 1 ? o[0] : o.length === 2 ? `${o[0]} and ${o[1]}` : `${o.slice(0, -1).join(", ")} and ${o[o.length - 1]}`;
  const warmSummary = directBuyer && directOwners.length
    ? `${fmtOwners(directOwners)} ${directOwners.length === 1 ? "knows" : "know"} ${directBuyer.name} directly — that's the warm route to this buyer. ${directOwners.length === 1 ? (isSelf(directOwners[0]) ? "Reach out yourself." : `Ask ${directOwners[0]} to broker it.`) : "Go through whichever of them you're closest to."}`
    : conns.length
    ? `${teamOwners.length > 1 ? `${fmtOwners(teamOwners)} know` : `${fmtOwners(teamOwners)} knows`} ${conns.length} ${conns.length === 1 ? "person" : "people"} at ${name}${warmTop[0] ? ` (strongest: ${warmTop[0].name}, ${warmTop[0].position} — via ${warmTop[0].owner})` : ""} — ask for a warm intro to the buyer.`
    : `No one on the team knows anyone at ${name} yet — cold approach. Lead with the specific hiring signal.`;

  const confidence: BuyerConfidence = ranked.some((b) => b.confidence === "confirmed")
    ? "confirmed"
    : ranked.some((b) => b.confidence === "likely")
    ? "likely"
    : "thin";

  return {
    companyName: name,
    domain,
    buyers: ranked.slice(0, 4),
    location,
    warmSummary,
    confidence,
    sources: [...sourceSet],
    generatedAt: new Date().toISOString(),
    notes: [...new Set(notes)],
  };
}

/* ------------------------------------------------------------------ *
 * Model extraction — grounded, zero-invention.
 * ------------------------------------------------------------------ */

interface RawBuyer {
  name: string | null;
  title: string;
  city: string | null;
  why: string;
  sourceUrl: string | null;
  companyHq: string | null;
}

const EXTRACT_SYSTEM = `You extract DECISION-MAKERS from provided web evidence for a sales rep selling "Buddy," an AI recruiter that interviews every applicant against the role and employer criteria, then continuously helps the hiring team see who deserves human time.

You are given EVIDENCE BLOCKS, each tagged with its source URL. You may ONLY use information literally present in the evidence. NEVER invent, infer, or guess a name, title, or city that is not in the text. If the evidence does not name a person, return an empty people list — that is correct and expected, not a failure.

Choose contextually rather than using a fixed title order:
- Tiny founder-led company with no recruiting leader: Founder / CEO or the functional hiring owner.
- Company with recruiting leadership or meaningful hiring volume: Head of Talent / Recruiting / People.
- Function-heavy hiring: that function's leader may own the pain.
- CTO / Head of Engineering only when the supplied roles show engineering hiring is material.
A warm employee can be the path to the buyer without being the buyer.

For each person you find IN THE EVIDENCE, capture:
- name (exact, as written)
- title (exact)
- city (ONLY if the evidence states it; else null)
- sourceUrl (the URL tag of the block you found them in)
- why: one short line on why they'd care about Buddy, grounded in their role.

Also capture companyHq (city) if the evidence states the company's location; else null.

Return ONLY JSON:
{"companyHq": string|null, "people": [{"name": string, "title": string, "city": string|null, "sourceUrl": string, "why": string}]}
Never include a person whose name is not explicitly in the evidence.`;

async function extractBuyers(companyName: string, evidence: string, context: BuyerContext): Promise<RawBuyer[]> {
  const raw = await complete({
    tier: "mid",
    system: EXTRACT_SYSTEM,
    json: true,
    maxTokens: 900,
    user: `Company: ${companyName}\nCompany size/stage: ${context.size ?? "unknown"} / ${context.stage ?? "unknown"}\nVerified open roles: ${(context.hiringRoles ?? []).join(", ") || "unknown"}\n\nEVIDENCE:\n${evidence}`,
  });
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // salvage a JSON object if the model wrapped it
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { people: [] };
  }
  const hq: string | null = parsed?.companyHq ?? null;
  const people: any[] = Array.isArray(parsed?.people) ? parsed.people : [];
  return people
    .filter((p) => p && typeof p.name === "string" && p.name.trim().length > 1)
    .map((p) => ({
      name: p.name.trim(),
      title: (p.title || "").trim(),
      city: p.city && String(p.city).trim() ? String(p.city).trim() : null,
      why: (p.why || "").trim(),
      sourceUrl: p.sourceUrl && String(p.sourceUrl).trim() ? String(p.sourceUrl).trim() : null,
      companyHq: hq,
    }));
}

/* ------------------------------------------------------------------ *
 * Small helpers.
 * ------------------------------------------------------------------ */

// Is this owner the person actually using the app? Today the app user is Jolene
// (the rep). "Self" owners can reach out directly; others get brokered through.
function isSelf(owner: string): boolean {
  return /jolene/i.test(owner);
}

function sameName(a: string, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

function whyForFit(fit: BuyerCandidate["roleFit"]): string {
  switch (fit) {
    case "founder":
      return "At a small founder-led company, this person often owns the tradeoff between interviewing everyone and protecting the team's time.";
    case "talent":
      return "Owns the applicant workflow; Buddy helps the team speak with everyone while reserving human interviews for the right candidates.";
    case "eng":
      return "Relevant when engineering hiring is the active bottleneck and the team needs better role-fit signal before human interviews.";
    case "functional":
      return "Relevant when this leader owns the function absorbing the current hiring load.";
    default:
      return "Involved in hiring decisions.";
  }
}

function targetTitle(fit: BuyerCandidate["roleFit"]): string {
  if (fit === "founder") return "Founder / CEO";
  if (fit === "talent") return "Head of Talent / Recruiting";
  if (fit === "eng") return "CTO / Head of Engineering";
  if (fit === "functional") return "Functional hiring leader";
  return "Hiring workflow owner";
}

function isEngineeringHeavy(roles: string[]): boolean {
  if (roles.length < 2) return false;
  const eng = roles.filter((r) => /engineer|developer|software|data|security|technical|devops|infrastructure/i.test(r)).length;
  return eng / roles.length >= 0.5;
}

function functionalBuyerQueries(name: string, roles: string[]): string[] {
  const dominant = dominantHiringFunction(roles);
  if (dominant === "sales") return [`${name} "head of sales" OR CRO OR "VP Sales"`];
  if (dominant === "marketing") return [`${name} CMO OR "head of marketing" OR "VP Marketing"`];
  if (dominant === "product") return [`${name} CPO OR "head of product" OR "VP Product"`];
  if (dominant === "operations") return [`${name} COO OR "head of operations" OR "VP Customer"`];
  return [];
}

type HiringFunction = "sales" | "marketing" | "product" | "operations";

function dominantHiringFunction(roles: string[]): HiringFunction | null {
  if (roles.length < 2) return null;
  const patterns: Record<HiringFunction, RegExp> = {
    sales: /sales|account executive|business development|revenue|partnership/i,
    marketing: /marketing|growth|demand generation|content/i,
    product: /product|product manager|design|research/i,
    operations: /operations|customer success|support|implementation|delivery/i,
  };
  const counts = (Object.keys(patterns) as HiringFunction[])
    .map((key) => ({ key, count: roles.filter((r) => patterns[key].test(r)).length }))
    .sort((a, b) => b.count - a.count);
  const top = counts[0];
  return top && top.count >= 2 && top.count / roles.length >= 0.5 ? top.key : null;
}

function titleMatchesFunction(title: string, fn: HiringFunction): boolean {
  const patterns: Record<HiringFunction, RegExp> = {
    sales: /sales|revenue|business development|partnership/i,
    marketing: /marketing|growth|demand/i,
    product: /product|design|research/i,
    operations: /operations|customer|support|implementation|delivery/i,
  };
  return patterns[fn].test(title);
}

function fallbackFits(context: BuyerContext): Array<BuyerCandidate["roleFit"]> {
  const roles = context.hiringRoles ?? [];
  const out: Array<BuyerCandidate["roleFit"]> = ["talent", "founder"];
  if (isEngineeringHeavy(roles)) out.push("eng");
  else if (functionalBuyerQueries("company", roles).length) out.push("functional");
  return out;
}

function locationNote(hq: string | null, near: "nyc" | "chicago" | null, warmCount: number): string {
  if (near === "nyc") return `${hq ? hq + " · " : ""}NYC metro — near you. Coffee is on the table.`;
  if (near === "chicago") return `${hq ? hq + " · " : ""}Chicago metro — near you. Coffee is on the table.`;
  if (hq) return `${hq} — remote from your NYC/Chicago bases${warmCount ? `, but you know ${warmCount} there` : ""}. Approach online first.`;
  return "Location unconfirmed — treat as remote until verified.";
}
