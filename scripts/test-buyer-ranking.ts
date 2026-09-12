import assert from "node:assert/strict";
import { rankBuyers, type BuyerCandidate, type BuyerContext } from "../lib/buyer";

function candidate(title: string, roleFit: BuyerCandidate["roleFit"], warm = false): BuyerCandidate {
  return {
    name: title,
    title,
    roleFit,
    why: "test",
    city: null,
    cityBasis: "unknown",
    confidence: "confirmed",
    sourceUrl: "https://example.com",
    warm: warm
      ? { direct: true, directOwners: ["Jolene"], count: 1, owners: ["Jolene"], best: [] }
      : null,
  };
}

function first(candidates: BuyerCandidate[], context: BuyerContext): string {
  return rankBuyers(candidates, context)[0]?.title ?? "";
}

assert.equal(
  first(
    [candidate("CEO", "founder"), candidate("Head of Talent", "talent"), candidate("VP Sales", "functional"), candidate("CTO", "eng")],
    { size: "51-200", hiringRoles: ["Account Executive", "Sales Development Representative", "VP Partnerships"] }
  ),
  "Head of Talent",
  "a scaled company with recruiting leadership should route hiring volume to Talent"
);

assert.equal(
  first(
    [candidate("CEO", "founder"), candidate("Head of Talent", "talent"), candidate("CTO", "eng")],
    { size: "11-50", stage: "Series A", hiringRoles: ["Backend Engineer", "Frontend Engineer", "Data Engineer"] }
  ),
  "CTO",
  "engineering-heavy hiring should make the engineering owner the primary buyer"
);

assert.equal(
  first(
    [candidate("CEO", "founder"), candidate("CTO", "eng")],
    { size: "1-10", stage: "Seed", hiringRoles: ["Operations Associate"] }
  ),
  "CEO",
  "a tiny company without recruiting leadership should route to the founder"
);

assert.equal(
  first(
    [candidate("CEO", "founder"), candidate("VP Sales", "functional"), candidate("CTO", "eng")],
    { size: "51-200", hiringRoles: ["Account Executive", "Sales Development Representative", "Sales Engineer"] }
  ),
  "VP Sales",
  "concentrated non-engineering hiring should route to the matching functional owner"
);

assert.equal(
  first(
    [candidate("CEO", "founder"), candidate("Head of Talent", "talent")],
    { hiringRoles: [] }
  ),
  "Head of Talent",
  "confirmed recruiting leadership should own the workflow even when company metadata is thin"
);

assert.equal(
  first(
    [candidate("CEO", "founder"), candidate("CTO", "eng", true), candidate("Head of Talent", "talent")],
    { size: "51-200", hiringRoles: ["Account Executive", "Customer Success Manager", "Operations Manager"] }
  ),
  "Head of Talent",
  "a warm but weakly relevant contact must remain the path, not displace the actual buyer"
);

console.log("buyer ranking: 6 contextual scenarios passed");
