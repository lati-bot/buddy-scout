// Multi-ATS fetch + normalization layer (DESIGN.md §2B).
//
// The whole point: every major ATS publishes a free, public, no-auth JSON API.
// Given a company domain we (a) detect which ATS it uses, (b) hit that API,
// (c) NORMALIZE five wildly different schemas into ONE internal Role shape.
//
// "The real cost isn't fetching, it's normalizing." Each adapter handles its
// documented quirks (see comments) so downstream code never sees ATS-specific mess.
//
// Server-side only. Honest UA, timeouts (SECURITY-NOTES §4). Every Role carries a
// source URL — provenance is the type system of the pipeline.

const UA = "BuddyScout/0.1 (+B2B sales prospecting; respects robots.txt)";
const TIMEOUT = 15000;

export type Ats = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "recruitee";

/** The ONE canonical role shape everything maps into. */
export interface Role {
  title: string;
  department?: string;
  location?: string;
  workplaceType?: "remote" | "hybrid" | "onsite";
  url?: string;              // link to the specific posting (provenance)
  postedAt?: string;         // ISO-8601, normalized from each ATS's format
  salary?: { min?: number; max?: number; currency?: string; interval?: string };
}

export interface FetchResult {
  ats: Ats | "html" | "none";
  boardUrl: string;          // the source we pulled from (provenance)
  slug?: string;
  roles: Role[];
  ok: boolean;
  error?: string;
}

// ---------- low-level http ----------

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function normWorkplace(s?: string): Role["workplaceType"] | undefined {
  if (!s) return undefined;
  const l = s.toLowerCase();
  if (l.includes("remote")) return "remote";
  if (l.includes("hybrid")) return "hybrid";
  if (l.includes("on-site") || l.includes("onsite") || l.includes("on site")) return "onsite";
  return undefined;
}

// Coerce any ATS field to a clean string. Some boards (e.g. bunq, norm.ai)
// return a title as an object/number instead of a string; this guarantees a
// string flows downstream so a filter like `title.trim()` can never blow up
// the research loop.
function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // common shapes: {name}, {text}, {en}, {label}
    for (const k of ["name", "text", "label", "en", "value"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return "";
}

// ---------- adapters (each returns normalized Role[]) ----------

// GREENHOUSE: boards-api.greenhouse.io/v1/boards/{token}/jobs
// Quirk: one response, no pagination even for 500+ roles. content is HTML-ESCAPED.
async function greenhouse(slug: string): Promise<Role[]> {
  const data = await getJson<{
    jobs?: Array<{
      title?: string; absolute_url?: string; updated_at?: string;
      location?: { name?: string };
      departments?: Array<{ name?: string }>;
    }>;
  }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return (data.jobs ?? []).map((j) => ({
    title: unescapeHtml(str(j.title)).trim(),
    department: j.departments?.[0]?.name,
    location: j.location?.name,
    workplaceType: normWorkplace(j.location?.name),
    url: j.absolute_url,
    postedAt: j.updated_at, // already ISO-8601 with offset
  }));
}

// LEVER: api.lever.co/v0/postings/{company}?mode=json
// Quirks: flat array (no wrapper). createdAt = epoch MILLISECONDS. workplaceType is reliable.
// Unknown slug = real HTTP 404 (good for detection).
async function lever(slug: string): Promise<Role[]> {
  const data = await getJson<
    Array<{
      text?: string; hostedUrl?: string; createdAt?: number; workplaceType?: string;
      categories?: { department?: string; team?: string; location?: string; commitment?: string };
    }>
  >(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return (data ?? []).map((j) => ({
    title: str(j.text).trim(),
    department: j.categories?.department ?? j.categories?.team,
    location: j.categories?.location,
    workplaceType: normWorkplace(j.workplaceType),
    url: j.hostedUrl,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
  }));
}

// ASHBY: api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
// Quirk: salary nests in summaryComponents OR compensationTiers[].components — parse both.
async function ashby(slug: string): Promise<Role[]> {
  const data = await getJson<{
    jobs?: Array<{
      title?: string; jobUrl?: string; publishedAt?: string;
      departmentName?: string; locationName?: string; isRemote?: boolean;
      compensation?: {
        summaryComponents?: Array<{ minValue?: number; maxValue?: number; currencyCode?: string; interval?: string }>;
        compensationTiers?: Array<{ components?: Array<{ minValue?: number; maxValue?: number; currencyCode?: string; interval?: string }> }>;
      };
    }>;
  }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return (data.jobs ?? []).map((j) => {
    const comp =
      j.compensation?.summaryComponents?.[0] ??
      j.compensation?.compensationTiers?.[0]?.components?.[0];
    return {
      title: str(j.title).trim(),
      department: j.departmentName,
      location: j.locationName,
      workplaceType: j.isRemote ? "remote" : normWorkplace(j.locationName),
      url: j.jobUrl,
      postedAt: j.publishedAt,
      salary: comp
        ? { min: comp.minValue, max: comp.maxValue, currency: comp.currencyCode, interval: comp.interval }
        : undefined,
    };
  });
}

// SMARTRECRUITERS: api.smartrecruiters.com/v1/companies/{company}/postings
// Quirks: paginates (limit/offset). WRONG COMPANY = HTTP 200 totalFound:0 (NOT 404) — must
// require totalFound>0 before trusting detection. List has no descriptions (fine, we want titles).
async function smartrecruiters(slug: string): Promise<Role[]> {
  const roles: Role[] = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 20; page++) {
    const data = await getJson<{
      totalFound?: number;
      content?: Array<{
        name?: string; ref?: string; releasedDate?: string;
        department?: { label?: string };
        location?: { city?: string; remote?: boolean };
      }>;
    }>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${limit}&offset=${offset}`);
    const batch = data.content ?? [];
    for (const j of batch) {
      roles.push({
        title: str(j.name).trim(),
        department: j.department?.label,
        location: j.location?.city,
        workplaceType: j.location?.remote ? "remote" : undefined,
        url: j.ref,
        postedAt: j.releasedDate,
      });
    }
    if (batch.length < limit) break;
    offset += limit;
  }
  return roles;
}

// RECRUITEE: {company}.recruitee.com/api/offers/
// Quirks: per-company SUBDOMAIN. Wrong slug = DNS error (connection failure, not HTTP).
// Dates "2026-05-29 14:07:42 UTC" (non-ISO). employment_type composite codes.
async function recruitee(slug: string): Promise<Role[]> {
  const data = await getJson<{
    offers?: Array<{
      position?: string; careers_url?: string; published_at?: string;
      department?: string; location?: string; remote?: boolean;
    }>;
  }>(`https://${slug}.recruitee.com/api/offers/`);
  return (data.offers ?? []).map((j) => ({
    title: str(j.position).trim(),
    department: j.department,
    location: j.location,
    workplaceType: j.remote ? "remote" : normWorkplace(j.location),
    url: j.careers_url,
    // "2026-05-29 14:07:42 UTC" -> ISO
    postedAt: j.published_at ? new Date(j.published_at.replace(" UTC", "Z").replace(" ", "T")).toISOString() : undefined,
  }));
}

// ---------- detection ----------

/** Pull a known ATS slug straight out of a careers/board URL if present. */
export function atsFromUrl(url: string): { ats: Ats; slug: string } | null {
  const patterns: Array<[Ats, RegExp]> = [
    ["greenhouse", /(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i],
    ["greenhouse", /greenhouse\.io\/embed\/job_board\?for=([^&]+)/i],
    ["lever", /jobs\.lever\.co\/([^/?#]+)/i],
    ["ashby", /jobs\.ashbyhq\.com\/([^/?#]+)/i],
    ["smartrecruiters", /careers\.smartrecruiters\.com\/([^/?#]+)/i],
    ["recruitee", /([^/.]+)\.recruitee\.com/i],
  ];
  for (const [ats, re] of patterns) {
    const m = url.match(re);
    if (m && m[1] && m[1] !== "embed") return { ats, slug: m[1] };
  }
  return null;
}

const ADAPTERS: Record<Ats, (slug: string) => Promise<Role[]>> = {
  greenhouse, lever, ashby, smartrecruiters, recruitee,
};

/**
 * Detect which ATS a company (by slug guess, usually the domain's second-level name)
 * uses by probing each public API. Order matters: cheap/definitive-404 ones first.
 * SmartRecruiters lies (200 + totalFound:0) so we require roles>0 OR explicit success there.
 */
export async function detectAts(slugGuess: string): Promise<{ ats: Ats; roles: Role[] } | null> {
  const order: Ats[] = ["greenhouse", "lever", "ashby", "recruitee", "smartrecruiters"];
  for (const ats of order) {
    try {
      const roles = await ADAPTERS[ats](slugGuess);
      // SmartRecruiters + Recruitee can "succeed" emptily; only trust non-empty for those.
      if (roles.length > 0) return { ats, roles };
    } catch {
      // 404 / DNS error = not this ATS, keep probing.
    }
  }
  return null;
}

// ---------- public entry ----------

/**
 * Get normalized roles for a company.
 * @param opts.boardUrl  a known careers/board URL (fast path via atsFromUrl)
 * @param opts.slugGuess a slug to probe when no board URL (usually domain SLD, e.g. "rain")
 */
export async function fetchRoles(opts: { boardUrl?: string; slugGuess?: string; domain?: string }): Promise<FetchResult> {
  // Fast path: we already know the board URL.
  if (opts.boardUrl) {
    const hit = atsFromUrl(opts.boardUrl);
    if (hit) {
      try {
        const roles = await ADAPTERS[hit.ats](hit.slug);
        return { ats: hit.ats, boardUrl: opts.boardUrl, slug: hit.slug, roles, ok: true };
      } catch (e: any) {
        return { ats: hit.ats, boardUrl: opts.boardUrl, slug: hit.slug, roles: [], ok: false, error: e.message };
      }
    }
  }
  // Detection path: probe by slug guess.
  const guess = opts.slugGuess ?? (opts.boardUrl ? new URL(opts.boardUrl).hostname.split(".").slice(-2, -1)[0] : undefined);
  if (guess) {
    const found = await detectAts(guess);
    if (found) {
      return {
        ats: found.ats,
        boardUrl: `[detected via ${found.ats} slug "${guess}"]`,
        slug: guess,
        roles: found.roles,
        ok: true,
      };
    }
  }

  // Discovery path: read the company's careers page to find its real ATS board.
  // (Handles slug != domain, e.g. tryrogo.com -> some other ATS slug.)
  const domain = opts.domain ?? (opts.boardUrl ? new URL(opts.boardUrl).hostname : undefined);
  if (domain) {
    const { discoverAts } = await import("./discover");
    const disc = await discoverAts(domain);
    if (disc) {
      try {
        const roles = await ADAPTERS[disc.ats](disc.slug);
        if (roles.length > 0) {
          return { ats: disc.ats, boardUrl: disc.foundOn, slug: disc.slug, roles, ok: true };
        }
      } catch { /* fall through */ }
    }
  }

  return { ats: "none", boardUrl: opts.boardUrl ?? "", roles: [], ok: false, error: "no ATS detected" };
}

/** Human-readable text for the classifier, built from normalized roles. */
export function rolesToText(r: FetchResult): string {
  if (!r.roles.length) return `[no roles found via ${r.ats}]`;
  const lines = r.roles.map((role) => {
    const bits = [role.title];
    if (role.department) bits.push(`(${role.department})`);
    if (role.location) bits.push(`@ ${role.location}`);
    if (role.workplaceType) bits.push(`[${role.workplaceType}]`);
    if (role.salary?.min || role.salary?.max)
      bits.push(`$${role.salary.min ?? "?"}-${role.salary.max ?? "?"} ${role.salary.currency ?? ""}`);
    return "- " + bits.join(" ");
  });
  return `Open roles (${r.roles.length}) via ${r.ats}:\n` + lines.join("\n");
}
