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
  const saved = await upsertCompany(company);
  return { company: saved, created: true };
}

/** Insert or update a company (domain is the id + partition key). */
export async function upsertCompany(company: Company): Promise<Company> {
  const container = await getContainer();
  company.updatedAt = new Date().toISOString();
  const { resource } = await container.items.upsert<Company>(company);
  return resource as Company;
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

/** Attach computed heat to a company for API responses (not persisted). */
export function withHeat(c: Company): Company & { heat: string; ripeness: number } {
  return { ...c, heat: heatOf(c), ripeness: Math.round(ripeness(c)) };
}
