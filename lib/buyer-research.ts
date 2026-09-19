import type { Company } from "./company";
import { buildBuyerCard } from "./buyer";
import { recipientDraftFrom } from "./outreach";
import { saveBuyerResearch } from "./repo";
import { publicPageFetcher, publicWebSearch } from "./web-research";

/** Complete and persist the buyer + warm path + addressed-message stage. */
export async function researchAndSaveBuyer(company: Company): Promise<Company> {
  const card = await buildBuyerCard(
    {
      name: company.name ?? company.domain,
      domain: company.domain,
      location: company.location ?? null,
      size: company.size ?? null,
      stage: company.stage ?? null,
      hiringRoles: company.hiring.roles ?? [],
    },
    publicWebSearch,
    publicPageFetcher
  );
  const draft = await recipientDraftFrom(company, card);
  return saveBuyerResearch(company.domain, card as unknown as Record<string, unknown>, draft);
}
