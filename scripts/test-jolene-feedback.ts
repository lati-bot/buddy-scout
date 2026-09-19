import assert from "node:assert/strict";
import { assessmentRoleFit } from "../lib/company";
import { isNamedSourcedBuyer } from "../lib/buyer";
import { normalizeNetworkOwners } from "../lib/connections";

assert.deepEqual(
  assessmentRoleFit(["Junior Analyst", "Senior Engineer", "Engineering Manager"]).eligible,
  ["Junior Analyst", "Senior Engineer", "Engineering Manager"]
);
assert.equal(assessmentRoleFit(["Founding Engineer"]).leadershipOnly, false);
assert.equal(assessmentRoleFit(["VP Sales", "Head of People", "Director of Engineering", "CEO"]).leadershipOnly, true);
assert.equal(assessmentRoleFit(["VP Sales", "Account Executive"]).leadershipOnly, false);

assert.equal(isNamedSourcedBuyer({ name: null, sourceUrl: "https://example.com" }), false);
assert.equal(isNamedSourcedBuyer({ name: "Ada Lovelace", sourceUrl: null }), false);
assert.equal(isNamedSourcedBuyer({ name: "Ada Lovelace", sourceUrl: "not-a-url" }), false);
assert.equal(isNamedSourcedBuyer({ name: "Ada Lovelace", sourceUrl: "https://example.com/ada" }), true);

assert.deepEqual(normalizeNetworkOwners(["Jolene"], true), ["Jolene", "Tomi"]);
assert.deepEqual(normalizeNetworkOwners(["Tomi", "tomi", "Jolene"], false), ["Jolene", "Tomi"]);
assert.deepEqual(normalizeNetworkOwners([], false), []);

console.log("Jolene feedback: 11 focused assertions passed");
