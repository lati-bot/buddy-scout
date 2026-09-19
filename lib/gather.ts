// Gather stage — the researcher (DESIGN.md §2). Turns a company into a FactsBundle
// where every claim is sourced. This is the input to the writer; the writer sees NOTHING else.
//
// v1 sources: ATS roles (structured, high-confidence) + derived hiring-heat signal.
// Company basics come from what we already know (record) or the careers page, sourced honestly.
// Contact + warm-path are added by their own stages (Prospeo, LinkedIn CSV) — wired later.

import { FetchResult, Role } from "./fetcher";
import { fetchRoles } from "./fetcher";
import { FactsBundle, newBundle, addFact, Source } from "./facts";

const SALES_ROLE_RE =
  /\b(account executive|ae\b|sdr|bdr|sales development|business development|revenue|revops|go-to-market|gtm|account manager|partnerships|sales engineer|head of sales|cro|chief revenue)\b/i;

/** Measure posting recency without mistaking an old cluster for current velocity. */
function recencyHeat(roles: Role[]): { recent: number; total: number; newestDays: number | null } {
  const dated = roles
    .map((r) => (r.postedAt ? Date.parse(r.postedAt) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a);
  if (!dated.length) return { recent: 0, total: roles.length, newestDays: null };
  const newest = dated[0];
  const now = Date.now();
  const newestDays = Math.round((now - newest) / 86400000);
  const window = 14 * 86400000;
  const recent = dated.filter((t) => newest - t <= window).length;
  return { recent, total: roles.length, newestDays };
}

/**
 * Gather verified facts for a company. Returns a bundle ready for the writer.
 * @param opts.domain      canonical domain (also the dedupe key)
 * @param opts.companyName display name
 * @param opts.boardUrl    optional known ATS/careers URL (speeds fetch)
 * @param opts.knownAbout  optional short description we already trust (record/user-provided) + its source
 */
export async function gather(opts: {
  domain: string;
  companyName: string;
  boardUrl?: string;
  knownAbout?: { text: string; source: Source };
}): Promise<{ bundle: FactsBundle; fetch: FetchResult }> {
  const b = newBundle(opts.domain, opts.companyName);

  // Company basics — only if we actually have a trusted description. Never invented.
  if (opts.knownAbout) {
    addFact(b, "company", opts.knownAbout.text, opts.knownAbout.source, "high");
  } else {
    // Enrich from the company's OWN site meta (sourced, verified — not invention).
    const { siteDescription } = await import("./enrich");
    const info = await siteDescription(opts.domain);
    if (info.description) {
      addFact(
        b,
        "company",
        `${opts.companyName}: ${info.description}`,
        { kind: "web", ref: info.source, fetchedAt: new Date().toISOString() },
        "medium"
      );
    }
  }

  // The hiring signal — from the real ATS.
  const fetch = await fetchRoles({
    boardUrl: opts.boardUrl,
    slugGuess: opts.domain.split(".")[0],
    domain: opts.domain,
  });

  if (fetch.ok && fetch.roles.length) {
    // Drop ATS noise: empty titles and "pitch your own role" evergreen placeholders.
    const realRoles = fetch.roles.filter(
      (r) => typeof r.title === "string" && r.title.trim().length > 2 && !/pitch your own|open application|general application|future opportunit/i.test(r.title)
    );
    const src: Source = {
      kind: fetch.boardUrl.startsWith("http") ? "ats" : "ats",
      ref: fetch.boardUrl.startsWith("http") ? fetch.boardUrl : `${fetch.ats} board "${fetch.slug}"`,
      fetchedAt: new Date().toISOString(),
    };

    const heat = recencyHeat(realRoles);
    const salesRoles = realRoles.filter((r) => SALES_ROLE_RE.test(r.title));

    // One fact per meaningful open role (cap to avoid flooding the writer; keep sales-relevant first).
    const ordered = [...salesRoles, ...realRoles.filter((r) => !SALES_ROLE_RE.test(r.title))];
    for (const r of ordered.slice(0, 12)) {
      const bits = [r.title];
      if (r.department) bits.push(`(${r.department})`);
      if (r.location) bits.push(`in ${r.location}`);
      if (r.workplaceType) bits.push(`[${r.workplaceType}]`);
      addFact(b, "role", `Open role: ${bits.join(" ")}`, r.url ? { ...src, ref: r.url } : src, "high");
    }

    // Derived heat signal — sourced to the same board, honestly labeled. A tight
    // cluster is only a current velocity signal when its newest role is recent.
    const postingRecency = heat.newestDays === null
      ? "; posting dates unavailable"
      : heat.newestDays <= 30
      ? `; newest posted ${heat.newestDays}d ago${heat.recent > 1 ? `; ${heat.recent} posted within ~2 weeks of each other (current hiring velocity)` : ""}`
      : `; newest posting date is ${heat.newestDays}d old (roles remain listed, but do not describe this as a recent hiring push)`;
    addFact(
      b,
      "signal",
      `${realRoles.length} open roles via ${fetch.ats}` +
        postingRecency +
        (salesRoles.length ? `; ${salesRoles.length} sales/GTM-relevant` : "; no sales/GTM roles"),
      src,
      "high"
    );
  } else {
    // Honest: no verified hiring data. Thin, not guessed.
    addFact(
      b,
      "signal",
      `No public ATS board found for ${opts.domain}; hiring status unconfirmed from structured data.`,
      { kind: "careers-page", ref: `${opts.domain} (no API)`, fetchedAt: new Date().toISOString() },
      "thin"
    );
  }

  return { bundle: b, fetch };
}
