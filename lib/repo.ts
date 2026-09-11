// Company repository — all Cosmos reads/writes for Buddy Scout.
// Keyed on `domain`. Upsert is domain-idempotent (auto-dedupe).

import { getContainer } from "./cosmos";
import { Company, CompanyStatus, newCompany, normalizeDomain } from "./company";

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
        "SELECT * FROM c WHERE c.status = @status ORDER BY c.updatedAt DESC OFFSET 0 LIMIT @max",
      parameters: [
        { name: "@status", value: status },
        { name: "@max", value: max },
      ],
    })
    .fetchAll();
  return resources;
}

/** Companies due for a hiring re-check (older than `days`). */
export async function listDueForRecheck(days = 14, max = 100): Promise<Company[]> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const container = await getContainer();
  const { resources } = await container.items
    .query<Company>({
      query:
        "SELECT * FROM c WHERE (c.lastCheckedAt = null OR c.lastCheckedAt < @cutoff) OFFSET 0 LIMIT @max",
      parameters: [{ name: "@cutoff", value: cutoff }],
    })
    .fetchAll();
  return resources.slice(0, max);
}
