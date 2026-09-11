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
  whoTheyAre: string;
  hiringSignal: string;
  wayIn: string;
  strategy: { angle: string; likelyObjection: string; counter: string };
  draft: string;
  citedFactIds: string[];   // which facts the writer used
  sources: Source[];
  tier: Tier;
  generatedAt: string;
}

const SYSTEM = `You write sales packets for Dev Difference, which sells "Buddy" — an AI resume-screening / hiring-support product — to software startups that are actively hiring.

A packet is a SALES WEAPON, not a report. Every line must help the rep (Jolene) win THIS specific deal.

ABSOLUTE RULE — READ CAREFULLY:
You are given a numbered list of VERIFIED FACTS, each with an id like [f3]. You may ONLY use information contained in those facts. You must NOT add, infer, assume, or embellish ANY specific detail (technology, funding, headcount, product specifics, people) that is not literally stated in a fact. If it is not in the facts, it does not exist. Inventing a detail is the worst possible failure — it destroys Jolene's credibility.
When you state a specific claim, reference the fact id(s) it came from in "citedFactIds".
If the facts are thin, say so plainly and keep claims general rather than inventing specifics.

Voice: sharp human salesperson. No corporate buzzwords, no filler, no "in today's fast-paced world", no em-dash abuse. Short, direct, real. Vary sentence length.

The outreach draft: 3-4 sentences, copy-paste ready, references something REAL and specific FROM THE FACTS, leads with the angle (not "Hi I'm from Dev Difference"), sounds like a person wrote it.

Return ONLY a JSON object:
{
  "confidence": "high"|"medium"|"thin",
  "whoTheyAre": string,
  "hiringSignal": string,
  "wayIn": string,
  "strategy": { "angle": string, "likelyObjection": string, "counter": string },
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

  const parsed = JSON.parse(raw) as Omit<Packet, "sources" | "tier" | "generatedAt">;

  // Trust floor: the packet can never claim more confidence than the facts support.
  const factFloor = bundleConfidence(bundle);
  const order = { thin: 0, medium: 1, high: 2 } as const;
  const confidence =
    order[parsed.confidence] < order[factFloor] ? parsed.confidence : factFloor;

  return {
    ...parsed,
    confidence,
    sources: bundleSources(bundle),
    tier,
    generatedAt: new Date().toISOString(),
  };
}
