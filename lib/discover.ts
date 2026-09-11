// ATS discovery (DESIGN.md §2B "ATS discovery").
//
// Problem: a company's ATS slug often != its domain name. tryrogo.com might post on
// jobs.ashbyhq.com/rogo, or a Greenhouse token that isn't "rogo". So when slug-guessing
// from the domain fails, we go read the company's own careers page and pull the real
// ATS board link out of the HTML. This closes the "self-hosted careers page" gap.
//
// Strategy, in order:
//   1. Try common careers URLs on the domain (/careers, /jobs, /company/careers ...).
//   2. In each page's HTML, look for links/iframes to a known ATS host -> extract slug.
//   3. Also catch embedded boards (Greenhouse embed, Ashby embed) and JSON hints.
// Returns {ats, slug, foundOn} so provenance records WHERE we discovered it.

import { Ats, atsFromUrl } from "./fetcher";

const UA = "BuddyScout/0.1 (+B2B sales prospecting; respects robots.txt)";
const TIMEOUT = 12000;

export interface Discovery {
  ats: Ats;
  slug: string;
  foundOn: string; // the careers URL where we found the board link (provenance)
}

const CAREERS_PATHS = [
  "/careers", "/careers/", "/jobs", "/jobs/", "/company/careers",
  "/about/careers", "/join", "/join-us", "/work-with-us", "/careers/jobs",
];

async function getHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// All the ways an ATS board can appear in page HTML (links, iframes, embed scripts, JSON).
const ATS_HINTS: Array<[Ats, RegExp]> = [
  ["greenhouse", /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i],
  ["greenhouse", /greenhouse\.io\/embed\/job_board\?for=([a-z0-9_-]+)/i],
  ["greenhouse", /grnh\.se\/([a-z0-9_-]+)/i],
  ["lever", /jobs\.lever\.co\/([a-z0-9_-]+)/i],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i],
  ["ashby", /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_-]+)/i],
  ["smartrecruiters", /jobs\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/],
  ["smartrecruiters", /careers\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/],
  ["recruitee", /([a-z0-9-]+)\.recruitee\.com/i],
];

function scanHtmlForAts(html: string): { ats: Ats; slug: string } | null {
  for (const [ats, re] of ATS_HINTS) {
    const m = html.match(re);
    if (m && m[1] && !["embed", "job_board", "www", "api", "jobs"].includes(m[1].toLowerCase())) {
      return { ats, slug: m[1] };
    }
  }
  return null;
}

/**
 * Given a bare domain (e.g. "tryrogo.com"), discover its ATS board by reading careers pages.
 * Returns null if nothing found (genuine self-hosted-no-API case → headless render territory).
 */
export async function discoverAts(domain: string): Promise<Discovery | null> {
  const base = domain.startsWith("http") ? domain.replace(/\/+$/, "") : `https://${domain}`;

  for (const path of CAREERS_PATHS) {
    const url = base + path;
    const html = await getHtml(url);
    if (!html) continue;

    const hit = scanHtmlForAts(html);
    if (hit) return { ats: hit.ats, slug: hit.slug, foundOn: url };

    // Some careers pages redirect straight to the ATS; catch it via a canonical/og:url too.
    const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
      ?? html.match(/property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
    if (canon) {
      const fromCanon = atsFromUrl(canon);
      if (fromCanon) return { ats: fromCanon.ats, slug: fromCanon.slug, foundOn: url };
    }
  }
  return null;
}
