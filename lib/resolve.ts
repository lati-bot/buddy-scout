// Resolve a company NAME (or URL) to a canonical domain (DESIGN.md on-demand flow).
// URL -> normalizeDomain directly. Bare name -> web search for the official site.
// Returns candidates so the UI's confirm panel can disambiguate ("which Rain?").

import { normalizeDomain } from "./company";

export interface ResolveCandidate {
  domain: string;
  name: string;
  hint?: string; // short description to help Jolene pick
}

const LOOKS_LIKE_DOMAIN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i;

/** Fast path: is this already a URL/domain? */
export function asDomain(input: string): string | null {
  const t = input.trim();
  if (LOOKS_LIKE_DOMAIN.test(t)) return normalizeDomain(t);
  return null;
}

/**
 * Resolve a free-text company name to candidate domains via web search.
 * Kept dependency-light: uses the same search the app already has access to.
 * The caller (route) injects a search function so this stays testable/portable.
 */
export async function resolveName(
  name: string,
  search: (q: string) => Promise<Array<{ url: string; title: string; description?: string }>>
): Promise<ResolveCandidate[]> {
  const direct = asDomain(name);
  if (direct) return [{ domain: direct, name }];

  // Primary path: GUESS the domain from the name and verify it actually loads.
  // "Ramp" -> ramp.com, "OpenAI" -> openai.com. This is instant, needs no search
  // API, and covers the vast majority of what Jolene will type. We only fall
  // through to web search when the guesses don't resolve. (The old DDG-scrape
  // resolver returned empty on Vercel, breaking the bare-name front door.)
  // Primary path: GUESS the domain from the name and verify it actually loads.
  // "Ramp" -> ramp.com, "OpenAI" -> openai.com. Instant, no search API needed.
  // IMPORTANT: prefer FULL-NAME domains (devdifference.com) over first-word ones
  // (dev.ai) — "dev difference" must not silently snap to "dev". We collect up to
  // a few verified guesses (not just the first) so the picker can offer choices
  // and the user can reject a bad match.
  const guesses = guessDomains(name);
  const verified: ResolveCandidate[] = [];
  for (const g of guesses) {
    if (await domainLoads(g)) {
      verified.push({ domain: g, name });
      if (verified.length >= 3) break;
    }
  }
  // If the name is multi-word, a first-word-only match (dev.ai for "dev difference")
  // is untrustworthy on its own — fall through to web search to find the REAL site
  // and present both, rather than committing to the loose guess.
  const multiWord = name.trim().split(/\s+/).length > 1;
  const onlyFirstWordMatch =
    verified.length === 1 && !verified[0].domain.replace(/\.[a-z]+$/, "").includes(compact(name));
  if (verified.length && !(multiWord && onlyFirstWordMatch)) return verified;

  const results = await search(`${name} official company website careers`);
  const seen = new Set(verified.map((v) => v.domain));
  const out: ResolveCandidate[] = [...verified];
  for (const r of results) {
    let host: string;
    try { host = new URL(r.url).hostname; } catch { continue; }
    const domain = normalizeDomain(host);
    // skip aggregators / social / job boards — we want the company's own site
    if (/linkedin|crunchbase|glassdoor|indeed|greenhouse|lever|ashby|twitter|facebook|wikipedia|ycombinator|bloomberg|pitchbook/i.test(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, name: r.title.split(/[|\-–—]/)[0].trim() || name, hint: r.description?.slice(0, 140) });
    if (out.length >= 4) break;
  }
  return out;
}

/** name -> compact stem ("dev difference" -> "devdifference") for match checks. */
export function compact(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Turn a company name into likely domains, best guess first.
 *  Full-name stems come FIRST ("dev difference" -> devdifference.com) so a
 *  multi-word company never silently collapses to its first word (dev.ai). */
export function guessDomains(name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const nospace = base.replace(/\s+/g, "");
  const hyphen = base.replace(/\s+/g, "-");
  const firstWord = base.split(/\s+/)[0];
  // Order matters: full-name variants first, first-word LAST (weakest signal).
  const stems = Array.from(new Set([nospace, hyphen, firstWord].filter(Boolean)));
  const tlds = [".com", ".io", ".ai", ".co"];
  const out: string[] = [];
  for (const s of stems) for (const tld of tlds) out.push(s + tld);
  return out;
}

/** Cheap liveness check: does this domain resolve to a real site?
 *  HEAD first (fast), fall back to GET; any non-5xx/opaque response counts.
 *  Short timeout so a bad guess doesn't stall the scout. */
async function domainLoads(domain: string): Promise<boolean> {
  const url = `https://${domain}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "BuddyScout/0.1" },
      signal: AbortSignal.timeout(6000),
    });
    return res.ok || (res.status >= 200 && res.status < 400);
  } catch {
    return false;
  }
}
