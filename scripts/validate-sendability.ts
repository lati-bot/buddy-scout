import { gather } from "../lib/gather";
import { generatePacket } from "../lib/packet";
import { buildBuyerCard } from "../lib/buyer";
import { recipientDraftFrom, selectedBuyer } from "../lib/outreach";
import { newCompany } from "../lib/company";
import { publicPageFetcher, publicWebSearch } from "../lib/web-research";

// Read-only live quality harness: public company/ATS/search reads + configured LLM calls.
// It never imports the repository, Cosmos client, cron route, or any sending integration.
const defaults = ["1910.ai", "222.place", "abacum.ai", "acely.com", "afterquery.com"];
const domains = process.argv.slice(2).filter(Boolean).length ? process.argv.slice(2) : defaults;

async function validate(domain: string) {
  const company = newCompany(domain, domain.split(".")[0]);
  const { bundle, fetch } = await gather({ domain, companyName: company.name ?? domain });
  if (!fetch.ok || fetch.roles.length === 0) {
    return { domain, outcome: fetch.ok ? "no-listed-roles" : "hiring-unavailable", ats: fetch.ats, error: fetch.error ?? null };
  }

  const packet = await generatePacket(bundle, "cheap");
  company.status = "hiring";
  company.hiring = {
    isHiring: true,
    roles: fetch.roles.map(role => role.title).filter(Boolean).slice(0, 20),
    source: fetch.boardUrl,
    seenAt: new Date().toISOString(),
  };
  company.lastCheck = { status: "confirmed-hiring", checkedAt: new Date().toISOString(), error: null };
  company.packet = { fast: packet as unknown as Record<string, unknown>, deep: null, generatedAt: packet.generatedAt };

  const card = await buildBuyerCard(
    { name: company.name, domain, location: company.location, size: company.size, stage: company.stage, hiringRoles: company.hiring.roles },
    publicWebSearch,
    publicPageFetcher
  );
  const buyer = selectedBuyer(card);
  const draft = await recipientDraftFrom(company, card);
  return {
    domain,
    outcome: draft ? "send-review-ready" : buyer ? "buyer-found-copy-failed" : "buyer-not-found",
    ats: fetch.ats,
    listedRoles: fetch.roles.length,
    packet: {
      evidenceStatus: packet.evidenceStatus,
      verdict: packet.verdict,
      whoTheyAre: packet.whoTheyAre,
      hook: packet.hook,
    },
    buyer: buyer ? { name: buyer.name, title: buyer.title, roleFit: buyer.roleFit, confidence: buyer.confidence, sourceUrl: buyer.sourceUrl } : null,
    draft: draft ? { firstTouch: draft.firstTouch, followUp: draft.followUp, composition: draft.composition } : null,
    notes: card.notes,
  };
}

async function main() {
  const results = [];
  for (const domain of domains) {
    try {
      results.push(await validate(domain));
    } catch (error) {
      results.push({ domain, outcome: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mode: "read-only-no-database-no-send", results }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
