import assert from "node:assert/strict";
import { applyOutreachAction, assessmentRoleFit, isBuyerResearchCandidate, isTodayCandidate, newCompany } from "../lib/company";
import { recipientDraftFrom, selectedBuyer, type RecipientCopyInput, type RecipientCopyWriter } from "../lib/outreach";
import type { BuyerCard, BuyerCandidate } from "../lib/buyer";

const now = Date.parse("2026-09-12T14:00:00.000Z");
const generatedAt = "2026-09-12T12:00:00.000Z";

function cardFor(buyer: BuyerCandidate, domain = "example.com"): BuyerCard {
  return {
    companyName: "Example", domain,
    location: { companyHq: null, companyHqSource: null, nearBase: null, note: "" },
    warmSummary: "No path researched.", confidence: buyer.confidence,
    sources: buyer.sourceUrl ? [buyer.sourceUrl] : [], generatedAt, notes: [], buyers: [buyer],
  };
}

const talent: BuyerCandidate = {
  name: "Jamie Rivera", title: "Head of Talent", roleFit: "talent", why: "Owns recruiting.",
  city: null, cityBasis: "unknown", confidence: "confirmed", sourceUrl: "https://example.com/team", warm: null,
};
const engineer: BuyerCandidate = {
  name: "Alex Chen", title: "VP Engineering", roleFit: "eng", why: "Leads engineering.",
  city: null, cityBasis: "unknown", confidence: "confirmed", sourceUrl: "https://example.com/leadership", warm: null,
};

function readyCompany() {
  const company = newCompany("https://www.example.com/path", "Example");
  company.status = "hiring";
  company.hiring = { isHiring: true, roles: ["Product Manager", "Account Executive"], source: "https://jobs.example.com", seenAt: generatedAt };
  company.packet.generatedAt = generatedAt;
  company.packet.fast = {
    evidenceStatus: "cited", generatedAt, verdict: { call: "chase" },
    hook: "You have two teams hiring at once. How are you protecting interview time?",
    draft: "Buddy interviews every applicant against each role, then surfaces who deserves human time.",
    citations: [{ claim: "Example lists Product Manager and Account Executive openings.", ref: "https://jobs.example.com" }],
  };
  company.lastCheck = { status: "confirmed-hiring", checkedAt: generatedAt, error: null };
  return company;
}

const roleAwareWriter: RecipientCopyWriter = async (input: RecipientCopyInput) => ({
  firstTouchBody: `${input.approvedHook} I thought this would be close to your ${input.buyer.roleFit} work.`,
  followUpBody: `Given your ${input.buyer.title} role, this looked relevant. ${input.approvedFollowUp}`,
});

async function main() {
  assert.deepEqual(
    assessmentRoleFit(["Junior Account Executive", "Senior Software Engineer", "Founding Designer"]).eligible,
    ["Junior Account Executive", "Senior Software Engineer", "Founding Designer"],
    "entry-through-senior and founding openings are in scope"
  );
  assert.equal(
    assessmentRoleFit(["VP Sales", "Head of Engineering", "Chief People Officer"]).leadershipOnly,
    true,
    "executive-only boards are not assessment-fit"
  );

  const company = readyCompany();
  assert.equal(isBuyerResearchCandidate(company, now), true, "fresh cited chase earns the buyer pass");
  assert.equal(
    isBuyerResearchCandidate({ ...company, hiring: { ...company.hiring, roles: ["VP Sales", "Head of Engineering"] } }, now),
    false,
    "executive-only hiring never enters buyer research or Today"
  );
  assert.equal(
    isBuyerResearchCandidate({ ...company, hiring: { ...company.hiring, roles: ["Founding Engineer"] } }, now),
    true,
    "a founding opening remains an explicit ICP exception"
  );
  assert.equal(isTodayCandidate(company, now), false, "a packet without recipient-specific copy is not Today-ready");

  const captured: RecipientCopyInput[] = [];
  const draft = await recipientDraftFrom(company, cardFor(talent), async input => {
    captured.push(input);
    return roleAwareWriter(input);
  });
  assert.equal(captured[0]?.buyer.title, "Head of Talent");
  assert.deepEqual(captured[0]?.hiringRoles, company.hiring.roles);
  assert.deepEqual(captured[0]?.citedClaims, ["Example lists Product Manager and Account Executive openings."]);
  assert.equal(draft?.recipientName, "Jamie Rivera");
  assert.equal(draft?.recipientTitle, "Head of Talent");
  assert.equal(draft?.recipientSourceUrl, "https://example.com/team");
  assert.equal(draft?.recipientConfidence, "confirmed");
  assert.equal(draft?.roleFit, "talent");
  assert.equal(draft?.composition, "buyer-specific");
  assert.ok(draft?.firstTouch.startsWith("Hi Jamie,"));
  assert.match(draft?.firstTouch ?? "", /talent/i);
  assert.match(draft?.followUp ?? "", /Head of Talent/i);

  const engineeringDraft = await recipientDraftFrom(company, cardFor(engineer), roleAwareWriter);
  assert.notEqual(draft?.firstTouch, engineeringDraft?.firstTouch, "different buyers need materially different first touches");
  assert.notEqual(draft?.followUp, engineeringDraft?.followUp, "different buyers need materially different follow-ups");

  company.buyer = { card: cardFor(talent) as unknown as Record<string, unknown>, generatedAt };
  company.outreach!.draft = draft!;
  assert.equal(isTodayCandidate(company, now), true, "only complete buyer-specific copy belongs Today");

  const sent = applyOutreachAction(company, "sent", null, "2026-09-12T13:00:00.000Z");
  assert.equal(sent.status, "contacted");
  assert.equal(sent.outreach?.state, "sent");
  assert.equal(isTodayCandidate(sent, now), false, "sent lead is suppressed from Today");

  const restored = applyOutreachAction(sent, "restored", "revisit", "2026-09-12T14:00:00.000Z");
  assert.equal(restored.status, "hiring");
  assert.equal(restored.outreach?.state, "unreviewed");
  assert.equal(isTodayCandidate(restored, now), true);
  assert.equal(restored.outreach?.events.length, 2);

  const unavailable = { ...company, lastCheck: { status: "unavailable" as const, checkedAt: generatedAt, error: "timeout" } };
  assert.equal(isTodayCandidate(unavailable, now), false, "unverified current state is not recommended");
  assert.equal(isTodayCandidate({ ...company, status: "contacted" }, now), false);
  assert.equal(isTodayCandidate({ ...company, hiring: { ...company.hiring, seenAt: "2020-01-01T00:00:00.000Z" } }, now), false);
  assert.equal(isTodayCandidate({ ...company, hiring: { ...company.hiring, seenAt: "2027-01-01T00:00:00.000Z" } }, now), false);
  assert.equal(isTodayCandidate({ ...company, lastCheck: undefined }, now), false);
  assert.equal(isTodayCandidate({ ...company, packet: { ...company.packet, fast: { ...company.packet.fast, verdict: { call: "skip" } } } }, now), false);
  assert.equal(isTodayCandidate({ ...company, packet: { ...company.packet, fast: { ...company.packet.fast, evidenceStatus: "needs-review" } } }, now), false);
  assert.equal(isTodayCandidate({ ...company, outreach: { ...company.outreach!, draft: { ...draft!, composition: "addressed-fallback" } } }, now), false);
  assert.equal(isTodayCandidate({ ...company, outreach: { ...company.outreach!, draft: { ...draft!, followUp: "" } } }, now), false);

  assert.equal(await recipientDraftFrom({ ...company, packet: { ...company.packet, fast: { ...company.packet.fast, evidenceStatus: "needs-review" } } }, cardFor(talent), roleAwareWriter), null);
  assert.equal(await recipientDraftFrom({ ...company, packet: { ...company.packet, fast: { ...company.packet.fast, hook: "" } } }, cardFor(talent), roleAwareWriter), null);
  assert.equal(await recipientDraftFrom({ ...company, packet: { ...company.packet, fast: { ...company.packet.fast, draft: "" } } }, cardFor(talent), roleAwareWriter), null);
  assert.equal(await recipientDraftFrom({ ...company, packet: { ...company.packet, fast: { ...company.packet.fast, generatedAt: undefined } } }, cardFor(talent), roleAwareWriter), null);
  assert.equal(await recipientDraftFrom(company, cardFor(talent, "other.example"), roleAwareWriter), null, "cross-company cards are rejected");
  assert.equal(await recipientDraftFrom(company, cardFor({ ...talent, confidence: "thin" }), roleAwareWriter), null);
  assert.equal(await recipientDraftFrom(company, cardFor({ ...talent, sourceUrl: null }), roleAwareWriter), null);
  assert.equal(await recipientDraftFrom(company, cardFor(talent), async () => ({ firstTouchBody: "A generic question.", followUpBody: "Buddy can help." })), null, "generic output cannot masquerade as buyer-specific");
  assert.equal(await recipientDraftFrom(company, cardFor(talent), async () => { throw new Error("writer failed"); }), null, "writer failure does not fall back to name insertion");

  const fallbackCard = cardFor({ ...talent, confidence: "thin" });
  fallbackCard.buyers.push(engineer);
  assert.equal(selectedBuyer(fallbackCard)?.name, "Alex Chen", "selection skips unsupported buyers");

  assert.equal(applyOutreachAction(sent, "sent").outreach?.events.length, 1, "repeat click is idempotent");
  assert.throws(() => applyOutreachAction({ ...company, status: "closed" }, "restored"));
  assert.equal(applyOutreachAction({ ...company, status: "closed" }, "sent").status, "closed");

  console.log("workflow: buyer-specific composition, Today readiness, suppression and state transitions passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
