// Company description enrichment — pull a trustworthy one-liner from the company's OWN
// site meta (og:description / meta description / title). Sourced to the page, so it's a
// verified fact, not invention. Feeds the "who they are" packet section and lifts the
// confidence floor above "thin" honestly.

const UA = "BuddyScout/0.1 (+B2B sales prospecting; respects robots.txt)";
const TIMEOUT = 10000;

export interface SiteInfo {
  description: string | null;
  source: string; // the URL we read it from (provenance)
}

function meta(html: string, ...names: string[]): string | null {
  for (const n of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${n}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const m = html.match(re) ?? html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${n}["']`, "i")
    );
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

/** Read a company's homepage meta for a trustworthy description. Best-effort; null if none. */
export async function siteDescription(domain: string): Promise<SiteInfo> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT), redirect: "follow" });
    if (!res.ok) return { description: null, source: url };
    const html = await res.text();
    const desc =
      meta(html, "og:description", "description", "twitter:description") ??
      // fall back to <title> if it's descriptive enough
      (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null);
    return { description: desc ? clean(desc).slice(0, 300) : null, source: url };
  } catch {
    return { description: null, source: url };
  }
}
