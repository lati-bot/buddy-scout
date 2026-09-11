// Three-tier Azure OpenAI router.
//   CHEAP (Luna)  = bulk grunt work (collection, "are they hiring?" classification, drafts)
//   MID   (Terra) = mid-cost reasoning; A/B challenger for strategy
//   SMART (Sol)   = top reasoning; only where an A/B proves it earns its cost
// Deployment NAMES come from env. Server-side only. Never import into client components.

import { AzureOpenAI } from "openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const cheapDeployment = process.env.AZURE_OPENAI_CHEAP_DEPLOYMENT;
const midDeployment = process.env.AZURE_OPENAI_MID_DEPLOYMENT;
const smartDeployment = process.env.AZURE_OPENAI_SMART_DEPLOYMENT;

export type Tier = "cheap" | "mid" | "smart";

export function llmConfigured(): boolean {
  return Boolean(endpoint && apiKey && cheapDeployment && smartDeployment);
}

function deploymentFor(tier: Tier): string | undefined {
  return tier === "smart" ? smartDeployment : tier === "mid" ? midDeployment : cheapDeployment;
}

// A/B verdict (Sep 11 2026, ab-packet.ts on Rain, identical facts):
//   Sol (smart) = slowest (~12.5s), priciest, and NOT better — most generic draft.
//   Terra (mid) = fastest (~6.4s), sharpest draft. Luna (cheap) = strong + dirt cheap.
// DECISION: Luna for bulk drafts/classification; Terra as the "smart" tier for hot leads;
// Sol reserved only if a future harder task proves it earns cost. Provenance made all three
// hallucination-free (none invented "Solana") — quality now comes from facts, not model IQ.

function clientFor(tier: Tier): { client: AzureOpenAI; deployment: string } {
  if (!endpoint || !apiKey) {
    throw new Error("Azure OpenAI not configured: set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY.");
  }
  const deployment = deploymentFor(tier);
  if (!deployment) {
    throw new Error(`Missing ${tier} deployment: set AZURE_OPENAI_${tier.toUpperCase()}_DEPLOYMENT.`);
  }
  const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });
  return { client, deployment };
}

interface CompleteOpts {
  tier: Tier;
  system: string;
  user: string;
  json?: boolean;      // request JSON object output
  maxTokens?: number;
  temperature?: number;
}

/** Single chat completion. Returns the message content string. */
export async function complete(opts: CompleteOpts): Promise<string> {
  const { client, deployment } = clientFor(opts.tier);
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens ?? 1024,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  return res.choices[0]?.message?.content ?? "";
}

/** Convenience: complete and parse a JSON object response. */
export async function completeJson<T = unknown>(opts: Omit<CompleteOpts, "json">): Promise<T> {
  const raw = await complete({ ...opts, json: true });
  return JSON.parse(raw) as T;
}
