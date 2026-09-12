// Packet generator (writer stage). Consumes ONLY a FactsBundle — never raw text, never
// the domain, never "what you know." Every specific claim must cite a fact id. This makes
// hallucination (e.g. inventing "Solana") structurally impossible: the writer literally
// cannot see anything that isn't a sourced fact.
//
// Model tier is a parameter so we can A/B Luna vs Terra vs Sol on the same facts.

import { complete } from "./llm";
import type { Tier } from "./llm";
import { FactsBundle, bundleToPrompt, bundleConfidence, bundleSources, Source } from "./facts";

export interface Packet {
  confidence: "high" | "medium" | "thin";
  verdict: { call: "chase" | "watch" | "skip"; line: string };
  whoTheyAre: string;
  hiringSignal: string;
  wayIn: string;
  strategy: { angle: string; likelyObjection: string; counter: string };
  hook: string;   // short first-touch: 1-2 curious sentences, their pain, NO product pitch
  draft: string;
  citedFactIds: string[];   // which facts the writer used
  citations: Citation[];    // resolved: each cited id -> its readable source (for the UI)
  sources: Source[];
  tier: Tier;
  generatedAt: string;
}

// A cited fact resolved to something Jolene can actually read/click, so the packet
// footer shows "Careers page", "LinkedIn", etc. with a link — not opaque "f1, f2".
export interface Citation {
  id: string;               // the fact id ("f3")
  label: string;            // human source label ("Careers page", "LinkedIn")
  ref: string;              // URL or identifier Jolene can check
  claim: string;            // the atomic fact this id backs
}

const SYSTEM = `You write sales packets for Dev Difference, which sells "Buddy" — an AI recruiter that interviews every applicant and continuously helps hiring teams identify who is worth their time.

PRODUCT TRUTH — use this positioning exactly:
- Buddy interviews applicants against the requirements of the specific role and the employer's explicit criteria.
- A resume is useful context for what Buddy should probe, but resume screening is NOT the product.
- As interviews happen, Buddy continuously updates how candidates are categorized by role fit; it is not a one-time batch ranking exercise.
- The value is two-sided: fewer wasted human interviews AND less chance of missing a strong applicant in the volume.
- Never claim Buddy replaces recruiters, sources candidates, detects cheating, guarantees hiring quality, or has an integration/workflow not stated here.

A packet is a SALES WEAPON, not a report. Every line must help the rep (Jolene) win THIS specific deal.

ABSOLUTE RULE — READ CAREFULLY:
You are given a numbered list of VERIFIED FACTS, each with an id like [f3]. You may ONLY use information contained in those facts. You must NOT add, infer, assume, or embellish ANY specific detail (technology, funding, headcount, product specifics, people) that is not literally stated in a fact. If it is not in the facts, it does not exist. Inventing a detail is the worst possible failure — it destroys Jolene's credibility.
When you state a specific claim, reference the fact id(s) it came from in "citedFactIds".
If the facts are thin, say so plainly and keep claims general rather than inventing specifics.

Voice: sharp human salesperson. No corporate buzzwords, no filler, no "in today's fast-paced world", no em-dash abuse. Short, direct, real. Vary sentence length.

THE VERDICT (most important line on the card): a decisive call — "chase", "watch", or "skip" — plus ONE sentence telling Jolene exactly what to do and why, naming the sharpest signal from the facts. Example: "Chase this. They've posted 40 GTM roles in two weeks — too many applicants for every strong one to get a real first look manually." Be decisive. "chase" when there's a real, active hiring signal; "watch" when thin/unclear; "skip" when no signal.

THE WAY IN: This packet does not automatically have leadership or network evidence. Only name a person, title, team, or warm path when a verified contact/warmpath fact explicitly supports it. Otherwise say that buyer research is needed; do not guess from company size, role count, or job titles. The separate buyer pass will decide whether the owner is a founder, recruiting leader, or functional hiring leader.

THE HOOK (the first message she actually sends): 1-2 sentences of genuine curiosity about THEIR specific pain, drawn from the facts. It must NOT mention Buddy, Dev Difference, or any product/feature. Its only job is to earn a reply. Connect the verified hiring signal to the human cost of giving every applicant a fair first look: strong people disappearing in volume, or hiring teams spending scarce human interview time on obvious non-fits. Example: "Forty-seven open roles is a lot of first conversations to get right. How are you making sure strong applicants don't disappear in the volume before a hiring manager meets them?" Personal, curious, specific. This is NOT a pitch.

THE DRAFT (the fuller follow-up / fallback): 3-4 sentences, copy-paste ready, references something REAL and specific FROM THE FACTS, leads with the angle (not "Hi I'm from Dev Difference"), sounds like a person wrote it. This is where Buddy can be named. Explain Buddy as interviewing every applicant against the role and employer criteria, then surfacing who deserves human time. Do not reduce it to "resume screening," "candidate ranking," or generic "hiring support."

Return ONLY a JSON object:
{
  "confidence": "high"|"medium"|"thin",
  "verdict": { "call": "chase"|"watch"|"skip", "line": string },
  "whoTheyAre": string,
  "hiringSignal": string,
  "wayIn": string,
  "strategy": { "angle": string, "likelyObjection": string, "counter": string },
  "hook": string,
  "draft": string,
  "citedFactIds": string[]
}`;

export async function generatePacket(
  bundle: FactsBundle,
  tier: Tier = "cheap"
): Promise<Packet> {
  const raw = await complete({
    tier,
    system: SYSTEM,
    json: true,
    maxTokens: 1400,
    user:
      `Company: ${bundle.companyName} (${bundle.domain})\n\n` +
      `VERIFIED FACTS (use only these):\n${bundleToPrompt(bundle)}\n\n` +
      `Write the packet. Cite fact ids for every specific claim.`,
  });

  const parsed = JSON.parse(raw) as Omit<Packet, "sources" | "tier" | "generatedAt" | "citations">;

  // Trust floor: the packet can never claim more confidence than the facts support.
  const factFloor = bundleConfidence(bundle);
  const order = { thin: 0, medium: 1, high: 2 } as const;
  const confidence =
    order[parsed.confidence] < order[factFloor] ? parsed.confidence : factFloor;

  // Resolve cited fact ids to readable sources so the UI can show "Careers page" /
  // "LinkedIn" with a link instead of opaque "f1, f2". Ids the writer cited that
  // don't exist are dropped (never fabricate a citation).
  const byId = new Map(bundle.facts.map((f) => [f.id, f]));
  const citations: Citation[] = (parsed.citedFactIds ?? [])
    .map((id) => byId.get(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => ({ id: f.id, label: sourceLabel(f.source.kind), ref: f.source.ref, claim: f.claim }));

  return {
    ...parsed,
    verdict: {
      call: (parsed.verdict?.call === "chase" || parsed.verdict?.call === "skip")
        ? parsed.verdict.call : (parsed.verdict?.call ?? "watch"),
      line: stripFactMarkers(parsed.verdict?.line ?? ""),
    },
    whoTheyAre: stripFactMarkers(parsed.whoTheyAre),
    hiringSignal: stripFactMarkers(parsed.hiringSignal),
    wayIn: stripFactMarkers(parsed.wayIn),
    hook: stripFactMarkers(parsed.hook ?? ""),
    draft: stripFactMarkers(parsed.draft),
    strategy: {
      angle: stripFactMarkers(parsed.strategy?.angle ?? ""),
      likelyObjection: stripFactMarkers(parsed.strategy?.likelyObjection ?? ""),
      counter: stripFactMarkers(parsed.strategy?.counter ?? ""),
    },
    confidence,
    citations,
    sources: bundleSources(bundle),
    tier,
    generatedAt: new Date().toISOString(),
  };
}

// Remove inline fact-id markers like "[f13]" or "[f14] [f15]" and tidy leftover
// whitespace/punctuation so the reader-facing prose is clean. Markers live in the
// "Backed by" footer (citations), never inline.
function stripFactMarkers(s: string): string {
  if (!s) return s;
  return s
    .replace(/\s*\[f\d+\]/gi, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Human labels for the citation footer. Keeps Jolene's eyes on "where", not jargon.
function sourceLabel(kind: Source["kind"]): string {
  switch (kind) {
    case "ats": return "ATS board";
    case "careers-page": return "Careers page";
    case "prospeo": return "Prospeo";
    case "linkedin-csv": return "LinkedIn";
    case "web": return "Web";
    case "newsletter": return "Newsletter";
    case "user": return "You";
    default: return "Source";
  }
}
