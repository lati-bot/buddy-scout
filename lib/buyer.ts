// Buyer Card — the deep "who do I approach, and what's my best path this week?" pass.
//
// This is DELIBERATELY not part of the fast scout. It's a slow, per-company research
// pass Jolene runs on a company she cares about ("Find the buyer →"). It spends real
// effort only when it's worth it.
//
// THE JOB (reasoned as Jolene, a rep working NYC + Chicago, selling Buddy — AI
// resume-screening / interview-integrity — to software startups hiring engineers):
//   Turn a company into a SPECIFIC HUMAN she can plausibly reach this week.
//
// Three layers, in effectiveness order:
//   1. BUYER(S)   — rank the right decision-maker(s): founder/CEO → Head of Talent →
//                   Head of Eng/CTO. From REAL sources only, labeled confirmed vs likely.
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
import { connectionsAtCompany, companyKey, type Connection } from "./connections";
import type { Company } from "./company";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type BuyerConfidence = "confirmed" | "likely" | "thin";

export interface BuyerCandidate {
  name: string | null;          // null = "role identified, person not yet named"
  title: string;                // the role as found/inferred
  roleFit: "founder" | "talent" | "eng" | "other";
  why: string;                  // one line: why THIS person, for Buddy
  city: string | null;          // person's city if public; else null
  cityBasis: "public" | "assumed-hq" | "unknown";
  confidence: BuyerConfidence;
  sourceUrl: string | null;     // where the name/title came from
  warm: BuyerWarm | null;       // do we know them / someone at the company?
}

export interface BuyerWarm {
  direct: boolean;              // is the buyer THEMSELF in the network?
  count: number;                // how many people we know at the company
  best: Array<{ name: string; position: string; url: string; strength: number }>;
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

export function roleFitOf(title: string): BuyerCandidate["roleFit"] {
  const t = title || "";
  if (RX_FOUNDER.test(t)) return "founder";
  if (RX_TALENT.test(t)) return "talent";
  if (RX_ENG.test(t)) return "eng";
  return "other";
}

// Approach priority: founder first (at a startup they ARE hiring; strongest net
// segment), then talent (feels the resume-screen pain directly), then eng (suffers
// bad-fit hires / cheated interviews). This is the order the card recommends.
const FIT_RANK: Record<BuyerCandidate["roleFit"], number> = {
  founder: 3,
  talent: 2,
  eng: 1,
  other: 0,
};

/** Rank buyers: warm+near beats cold+remote; role fit breaks ties; confirmed > likely. */
type ScoredCandidate = BuyerCandidate & { nearBaseScore?: number };

export function rankBuyers(cands: ScoredCandidate[]): ScoredCandidate[] {
  const score = (b: ScoredCandidate): number => {
    let s = FIT_RANK[b.roleFit] * 10;
    if (b.warm?.direct) s += 60;          // we KNOW this exact person = top of the pile
    else if (b.warm && b.warm.count > 0) s += 25; // we know someone at the company
    if (b.nearBaseScore) s += b.nearBaseScore;
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
  company: Pick<Company, "name" | "domain" | "location">,
  webSearch: WebSearch,
  fetchPage: (url: string) => Promise<{ url: string; text: string } | null>
): Promise<BuyerCard> {
  const name = company.name ?? company.domain;
  const domain = company.domain;
  const notes: string[] = [];
  const sourceSet = new Set<string>();

  // --- 1. WARM PATH (free, instant, our edge — do it first). --------------
  const conns = await connectionsAtCompany(name);
  const warmTop = conns.slice(0, 5).map((c) => ({
    name: c.name,
    position: c.position,
    url: c.url,
    strength: c.strength,
  }));
  const companyWarm: BuyerWarm | null = conns.length
    ? { direct: false, count: conns.length, best: warmTop }
    : null;

  // --- 2. FIND THE BUYER — real sources only. ---------------------------
  // Search public web for the company's decision-makers. We pull hits from the
  // company's own site (team/about/leadership) + LinkedIn + press, then let the
  // model EXTRACT names/titles/cities FROM THE FETCHED TEXT ONLY (never invent).
  const queries = [
    `${name} founder CEO`,
    `${name} "head of talent" OR "head of recruiting" OR "head of people"`,
    `${name} CTO OR "head of engineering"`,
    `${name} team leadership about`,
  ];

  const hits: WebHit[] = [];
  for (const q of queries) {
    try {
      const r = await webSearch(q);
      for (const h of r) if (!hits.find((x) => x.url === h.url)) hits.push(h);
    } catch { /* keep going */ }
  }

  // Prefer the company's own pages + LinkedIn for extraction (most trustworthy).
  const preferred = hits
    .filter((h) => h.url.includes(domain) || /linkedin\.com\/(in|company)/.test(h.url) || /about|team|leadership|people|founder/i.test(h.url))
    .slice(0, 6);
  const pool = (preferred.length ? preferred : hits).slice(0, 6);

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
      extracted = await extractBuyers(name, evidence);
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
    // Is this exact person in the network?
    const directMatch = conns.find((c) => sameName(c.name, e.name));
    let city = e.city ?? null;
    let cityBasis: BuyerCandidate["cityBasis"] = city ? "public" : "unknown";
    // Founder-likely-at-HQ assumption — LABELED, never presented as fact.
    if (!city && fit === "founder" && hqGuess) {
      city = hqGuess;
      cityBasis = "assumed-hq";
      notes.push(`${e.name ?? "Founder"}'s city assumed from company HQ (${hqGuess}) — not individually confirmed.`);
    }
    const near = baseFor(city);
    const warm: BuyerWarm | null = directMatch
      ? { direct: true, count: conns.length, best: warmTop }
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
    for (const fit of ["founder", "talent", "eng"] as const) {
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

  const ranked = rankBuyers(cands).map(({ nearBaseScore, ...b }) => b);

  // --- 4. Location summary (relative to her two bases). -----------------
  const topNear = ranked.map((b) => baseFor(b.city)).find(Boolean) ?? baseFor(hqGuess);
  const location: Location = {
    companyHq: hqGuess,
    companyHqSource: hqSource,
    nearBase: topNear ?? null,
    note: locationNote(hqGuess, topNear ?? null, conns.length),
  };

  // --- 5. Warm summary + overall confidence floor. ---------------------
  const directName = ranked.find((b) => b.warm?.direct)?.name;
  const warmSummary = directName
    ? `You already know ${directName} directly — that's your intro. Skip cold entirely.`
    : conns.length
    ? `You know ${conns.length} ${conns.length === 1 ? "person" : "people"} at ${name}${warmTop[0] ? ` (strongest: ${warmTop[0].name}, ${warmTop[0].position})` : ""} — ask for a warm intro to the buyer.`
    : `No mutual connection at ${name} yet — this is a cold approach. Lead with the specific hiring signal.`;

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

const EXTRACT_SYSTEM = `You extract DECISION-MAKERS from provided web evidence for a sales rep selling "Buddy" (AI resume-screening / interview-integrity) to software startups that hire engineers.

You are given EVIDENCE BLOCKS, each tagged with its source URL. You may ONLY use information literally present in the evidence. NEVER invent, infer, or guess a name, title, or city that is not in the text. If the evidence does not name a person, return an empty people list — that is correct and expected, not a failure.

Prioritize, in this order: (1) Founder / CEO, (2) Head of Talent / Recruiting / People, (3) CTO / Head of Engineering. These are Buddy's buyers.

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

async function extractBuyers(companyName: string, evidence: string): Promise<RawBuyer[]> {
  const raw = await complete({
    tier: "mid",
    system: EXTRACT_SYSTEM,
    json: true,
    maxTokens: 900,
    user: `Company: ${companyName}\n\nEVIDENCE:\n${evidence}`,
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

function sameName(a: string, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

function whyForFit(fit: BuyerCandidate["roleFit"]): string {
  switch (fit) {
    case "founder":
      return "At a startup this size the founder owns hiring — and feels the first-round-call drain Buddy removes.";
    case "talent":
      return "Owns screening directly; Buddy is the resume-screen layer that saves them the most time.";
    case "eng":
      return "Suffers bad-fit hires and cheated interviews; Buddy protects interview integrity.";
    default:
      return "Involved in hiring decisions.";
  }
}

function targetTitle(fit: BuyerCandidate["roleFit"]): string {
  return fit === "founder" ? "Founder / CEO" : fit === "talent" ? "Head of Talent / Recruiting" : "CTO / Head of Engineering";
}

function locationNote(hq: string | null, near: "nyc" | "chicago" | null, warmCount: number): string {
  if (near === "nyc") return `${hq ? hq + " · " : ""}NYC metro — near you. Coffee is on the table.`;
  if (near === "chicago") return `${hq ? hq + " · " : ""}Chicago metro — near you. Coffee is on the table.`;
  if (hq) return `${hq} — remote from your NYC/Chicago bases${warmCount ? `, but you know ${warmCount} there` : ""}. Approach online first.`;
  return "Location unconfirmed — treat as remote until verified.";
}
