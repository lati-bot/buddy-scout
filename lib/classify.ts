// The hiring classifier — Luna's core job.
// Reads scraped careers/site text and returns structured hiring signal.
// Server-side only.

import { complete } from "./llm";

export interface HiringVerdict {
  isHiring: boolean;
  roles: string[];          // specific open role titles found on the page
  salesRelevant: boolean;   // any GTM/sales/BD/CS roles? (Jolene sells to them)
  confidence: "high" | "medium" | "thin";
  evidence: string;         // 1 sentence: what on the page proves it
}

const SYSTEM = `You are a precise hiring-signal extractor for a B2B sales prospecting tool.
You read raw text scraped from a company's website or careers page and decide whether they are actively hiring.
Rules:
- Only report roles that actually appear in the provided text. Never invent roles.
- "isHiring" is true only if there is concrete evidence of open positions (job titles, "we're hiring", apply links, a count of openings).
- "salesRelevant" is true if any open role is in sales, business development, GTM, revenue, partnerships, or customer success.
- If the text is empty, an error page, a cookie/login wall, or has no job info, return isHiring=false, roles=[], confidence="thin".
- "evidence" is ONE short sentence citing what in the text supports your verdict.
Return ONLY a JSON object with keys: isHiring (bool), roles (string[]), salesRelevant (bool), confidence ("high"|"medium"|"thin"), evidence (string).`;

export async function classifyHiring(
  companyName: string,
  pageText: string
): Promise<HiringVerdict> {
  const clipped = pageText.slice(0, 12000); // keep token cost sane
  const raw = await complete({
    tier: "cheap",
    system: SYSTEM,
    user: `Company: ${companyName}\n\n--- SCRAPED PAGE TEXT ---\n${clipped}`,
    json: true,
    maxTokens: 500,
  });
  const parsed = JSON.parse(raw) as HiringVerdict;
  // Defensive normalization
  return {
    isHiring: Boolean(parsed.isHiring),
    roles: Array.isArray(parsed.roles) ? parsed.roles.slice(0, 25) : [],
    salesRelevant: Boolean(parsed.salesRelevant),
    confidence: ["high", "medium", "thin"].includes(parsed.confidence)
      ? parsed.confidence
      : "thin",
    evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
  };
}
