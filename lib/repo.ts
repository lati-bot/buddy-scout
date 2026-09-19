// Company repository — all Cosmos reads/writes for Buddy Scout.
// Keyed on `domain`. Upsert is domain-idempotent (auto-dedupe).

import { getContainer } from "./cosmos";
import {
  Company,
  CompanyStatus,
  newCompany,
  normalizeDomain,
  isDueForRecheck,
  ripeness,
  heatOf,
  type OutreachState,
  type RecipientDraft,
  isTodayCandidate,
  isBuyerResearchCandidate,
  applyOutreachAction,
} from "./company";

/** Fetch a company by domain, or null if not tracked yet. */
export async function getCompany(domainInput: string): Promise<Company | null> {
  const domain = normalizeDomain(domainInput);
  const container = await getContainer();
  try {
    const { resource } = await container.item(domain, domain).read<Company>();
    return resource ?? null;
  } catch (e: unknown) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

/**
 * Get an existing company by domain or create a fresh record.
 * This is the dedupe gate: every packet request runs through here first.
 */
export async function getOrCreateCompany(
  domainInput: string,
  name?: string
): Promise<{ company: Company; created: boolean }> {
  const existing = await getCompany(domainInput);
  if (existing) return { company: existing, created: false };
  const company = newCompany(domainInput, name);
  const container = await getContainer();
  try {
    const { resource } = await container.items.create<Company>(company);
    return { company: resource!, created: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 409) throw error;
    const winner = await getCompany(domainInput);
    if (!winner) throw error;
    return { company: winner, created: false };
  }
}

/** Insert or update a company (domain is the id + partition key). */
export async function upsertCompany(company: Company): Promise<Company> {
  const container = await getContainer();
  company.updatedAt = new Date().toISOString();
  const { resource } = await container.items.upsert<Company>(company);
  return resource as Company;
}

/** Optimistic merge: a slow research pass cannot overwrite a concurrent human decision. */
export async function mutateCompany(domain: string, change: (current: Company) => Company): Promise<Company> {
  const container = await getContainer();
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getCompany(domain);
    if (!current) throw new Error("Company not found.");
    const etag = (current as Company & { _etag: string })._etag;
    const next = change(current);
    next.updatedAt = new Date().toISOString();
    try {
      const { resource } = await container.item(current.id, current.domain).replace<Company>(next, {
        accessCondition: { type: "IfMatch", condition: etag },
      });
      return resource!;
    } catch (error) {
      if ((error as { code?: number }).code !== 412) throw error;
    }
  }
  throw new Error("Company changed concurrently. Please retry.");
}

/** List companies by status (e.g. the "hiring" queue Jolene sees). */
export async function listByStatus(
  status: CompanyStatus,
  max = 50
): Promise<Company[]> {
  const container = await getContainer();
  const { resources } = await container.items
    .query<Company>({
      query:
        "SELECT * FROM c WHERE c.status = @status OFFSET 0 LIMIT @max",
      parameters: [
        { name: "@status", value: status },
        { name: "@max", value: max },
      ],
    })
    .fetchAll();
  // Ripeness sort (client-side): the freshest, most-actionable lead sits on top
  // when Jolene opens the queue — not just newest-updated.
  return resources.sort((a, b) => ripeness(b) - ripeness(a));
}

/**
 * Companies due for a heat-tiered recheck.
 * Instead of one flat window, each company is due based on its heat:
 * hot ~daily, warm ~3d, cool ~weekly, cold ~biweekly (see RECHECK_DAYS).
 * We over-fetch loosely (anything not checked in the last day) then let the
 * per-company heat rule decide, and order hottest-first so the most
 * time-sensitive leads get refreshed first within the batch cap.
 */
export async function listDueForRecheck(_days = 14, max = 100): Promise<Company[]> {
  // Loose DB filter: nothing checked in the last ~day can possibly be due
  // (hot tier = 1 day is the tightest cadence). Keeps the read cheap.
  const cutoff = new Date(Date.now() - 1 * 86400_000).toISOString();
  const container = await getContainer();
  const { resources } = await container.items
    .query<Company>({
      query:
        "SELECT * FROM c WHERE (NOT IS_DEFINED(c.lastCheckedAt) OR IS_NULL(c.lastCheckedAt) OR c.lastCheckedAt < @cutoff) OFFSET 0 LIMIT 400",
      parameters: [{ name: "@cutoff", value: cutoff }],
    })
    .fetchAll();
  // Apply the per-heat cadence rule, then refresh the hottest (ripest) first.
  return resources
    .filter((c) => isDueForRecheck(c))
    .sort((a, b) => ripeness(b) - ripeness(a))
    .slice(0, max);
}

/** Whole queue, ripeness-ordered — for a queue view that spans statuses. */
export async function listQueue(max = 60): Promise<Company[]> {
  const container = await getContainer();
  const { resources } = await container.items
    .query<Company>({
      query: "SELECT * FROM c WHERE c.status != 'closed' OFFSET 0 LIMIT 400",
    })
    .fetchAll();
  return resources.sort((a, b) => ripeness(b) - ripeness(a)).slice(0, max);
}

/** The small action queue: only untouched companies with a current hiring signal and packet. */
export async function listToday(max = 8): Promise<Company[]> {
  const container = await getContainer();
  const { resources } = await container.items
    .query<Company>({
      query:
        "SELECT * FROM c WHERE c.status != 'closed' AND c.hiring.isHiring = true OFFSET 0 LIMIT 400",
    })
    .fetchAll();
  return resources
    .filter(c => isTodayCandidate(c))
    .sort((a, b) => ripeness(b) - ripeness(a))
    .slice(0, max);
}

/** Research and activity stay accessible without polluting the daily action list. */
export async function listWorkflowQueue(kind: "research" | "activity", max = 60): Promise<Company[]> {
  const container = await getContainer();
  const predicate = kind === "activity"
    ? "c.status = 'contacted' OR (IS_DEFINED(c.outreach.state) AND c.outreach.state != 'unreviewed')"
    : "c.status != 'closed' AND c.status != 'contacted' AND (NOT IS_DEFINED(c.outreach.state) OR c.outreach.state = 'unreviewed')";
  const { resources } = await container.items.query<Company>({
    query: `SELECT * FROM c WHERE (${predicate}) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT @max`,
    parameters: [{ name: "@max", value: max }],
  }).fetchAll();
  return kind === "research" ? resources.filter(c => !isTodayCandidate(c)) : resources;
}

/** Persist buyer research and the recipient-ready draft assembled from it. */
export async function saveBuyerResearch(
  domainInput: string,
  card: Record<string, unknown>,
  draft: RecipientDraft | null
): Promise<Company> {
  const generatedAt = new Date().toISOString();
  return mutateCompany(domainInput, company => ({
    ...company,
    buyer: { card, generatedAt },
    outreach: {
      state: company.outreach?.state ?? "unreviewed",
      draft: isBuyerResearchCandidate(company) && draft?.packetGeneratedAt === company.packet.generatedAt ? draft : null,
      events: company.outreach?.events ?? [],
    },
  }));
}

/** Record the human decision without sending anything on Jolene's behalf. */
export async function recordOutreachAction(
  domainInput: string,
  action: Exclude<OutreachState, "unreviewed"> | "restored",
  note?: string | null
): Promise<Company> {
  return mutateCompany(domainInput, company => applyOutreachAction(company, action, note));
}

/** Attach computed heat to a company for API responses (not persisted). */
export function withHeat(c: Company): Company & { heat: string; ripeness: number } {
  return { ...c, heat: heatOf(c), ripeness: Math.round(ripeness(c)) };
}
