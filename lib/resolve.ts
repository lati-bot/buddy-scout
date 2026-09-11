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

  const results = await search(`${name} official company website careers`);
  const seen = new Set<string>();
  const out: ResolveCandidate[] = [];
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
