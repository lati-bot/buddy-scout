import type { BuyerCard, BuyerCandidate } from "./buyer";
import type { Company, RecipientDraft } from "./company";
import { completeJson } from "./llm";

type PacketCopy = {
  hook?: string;
  draft?: string;
  evidenceStatus?: string;
  generatedAt?: string;
  citations?: Array<{ claim?: string; ref?: string }>;
};

export interface RecipientCopyInput {
  companyName: string;
  buyer: Pick<BuyerCandidate, "name" | "title" | "roleFit" | "sourceUrl" | "confidence">;
  hiringRoles: string[];
  approvedHook: string;
  approvedFollowUp: string;
  citedClaims: string[];
}

export interface RecipientCopyOutput {
  firstTouchBody: string;
  followUpBody: string;
}

export type RecipientCopyWriter = (input: RecipientCopyInput) => Promise<RecipientCopyOutput>;

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function selectedBuyer(card: BuyerCard): BuyerCandidate | null {
  return card.buyers.find(buyer => buyer.name && buyer.sourceUrl && buyer.confidence !== "thin") ?? null;
}

function cleanBody(value: unknown, recipient: string): string {
  if (typeof value !== "string") return "";
  const escaped = firstName(recipient).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value
    .trim()
    .replace(new RegExp(`^hi\\s+${escaped}\\s*,?\\s*`, "i"), "")
    .replace(/^[-*]\s+/, "")
    .trim();
}

function demonstratesRoleSpecificity(copy: string, buyer: BuyerCandidate): boolean {
  const normalized = copy.toLowerCase();
  const title = buyer.title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (title.length > 3 && normalized.includes(title)) return true;
  const markers: Record<BuyerCandidate["roleFit"], RegExp> = {
    founder: /\b(founder|ceo|company|team)\b/i,
    talent: /\b(talent|recruit|people|candidate|hiring team)\b/i,
    eng: /\b(engineer|technical|developer|cto)\b/i,
    functional: /\b(function|sales|revenue|marketing|product|operations|customer)\b/i,
    other: /\b(your role|your team|hiring)\b/i,
  };
  return markers[buyer.roleFit].test(copy);
}

const RECIPIENT_SYSTEM = `You write two recipient-specific sales messages for Jolene at Dev Difference.

PRODUCT TRUTH:
- Buddy is an AI recruiter that interviews every applicant against the requirements of the role and the employer's explicit criteria.
- As interviews happen, Buddy continuously updates how candidates are categorized by role fit.
- The value is fewer wasted human interviews and less chance of missing a strong applicant in the volume.
- Never claim Buddy replaces recruiters, sources candidates, detects cheating, guarantees quality, or has an unstated integration.

GROUNDING RULES:
- Use only the supplied buyer evidence, approved company copy, hiring-role titles, and cited claims.
- Do not invent responsibilities, priorities, headcount, applicant volume, technology, funding, or personal details.
- The buyer's title supports a restrained role connection, not claims about their private goals or workload.
- Do not mention a source, scraped profile, or that the recipient was researched.

FIRST TOUCH:
- Return 1–2 short sentences whose only job is to earn a reply.
- Keep the approved company-specific observation, but naturally frame the question for this buyer's role.
- Do not mention Buddy, Dev Difference, features, or ask for a meeting.

FOLLOW-UP:
- Return 3–4 short sentences.
- Connect this buyer's role to the verified hiring signal, then explain Buddy accurately.
- Sound like a sharp human seller, not a template. No buzzwords, flattery, or em-dash abuse.

Return JSON only, with message bodies and NO greeting:
{"firstTouchBody": string, "followUpBody": string}`;

async function defaultWriter(input: RecipientCopyInput): Promise<RecipientCopyOutput> {
  return completeJson<RecipientCopyOutput>({
    tier: "cheap",
    system: RECIPIENT_SYSTEM,
    maxTokens: 700,
    user: [
      `Company: ${input.companyName}`,
      `Verified buyer: ${input.buyer.name}, ${input.buyer.title}`,
      `Buyer role category: ${input.buyer.roleFit}`,
      `Buyer source: ${input.buyer.sourceUrl}`,
      `Verified open-role titles: ${input.hiringRoles.join(", ") || "none supplied"}`,
      `Approved first-touch observation: ${input.approvedHook}`,
      `Approved product follow-up: ${input.approvedFollowUp}`,
      `Cited company claims: ${input.citedClaims.join(" | ") || "none beyond the approved copy"}`,
      "Rewrite both messages for this specific buyer without adding facts.",
    ].join("\n"),
  });
}

/**
 * Compose copy around the selected sourced buyer. Failure returns null rather
 * than quietly presenting generic name-insertion as a send-ready message.
 */
export async function recipientDraftFrom(
  company: Company,
  card: BuyerCard,
  writer: RecipientCopyWriter = defaultWriter,
  buyer: BuyerCandidate | null = selectedBuyer(card)
): Promise<RecipientDraft | null> {
  if (card.domain !== company.domain) return null;
  const packet = company.packet?.fast as PacketCopy | null | undefined;
  if (!buyer?.name || !buyer.sourceUrl || !packet) return null;

  const hook = packet.hook?.trim();
  const followUp = packet.draft?.trim();
  if (!hook || !followUp || packet.evidenceStatus !== "cited" || !packet.generatedAt) return null;

  const input: RecipientCopyInput = {
    companyName: company.name ?? company.domain,
    buyer: {
      name: buyer.name,
      title: buyer.title,
      roleFit: buyer.roleFit,
      sourceUrl: buyer.sourceUrl,
      confidence: buyer.confidence,
    },
    hiringRoles: company.hiring.roles.slice(0, 20),
    approvedHook: hook,
    approvedFollowUp: followUp,
    citedClaims: Array.isArray(packet.citations)
      ? packet.citations.map(citation => citation?.claim?.trim()).filter((claim): claim is string => Boolean(claim))
      : [],
  };

  try {
    const generated = await writer(input);
    const firstTouchBody = cleanBody(generated?.firstTouchBody, buyer.name);
    const followUpBody = cleanBody(generated?.followUpBody, buyer.name);
    if (!firstTouchBody || !followUpBody || firstTouchBody.length > 700 || followUpBody.length > 1600) return null;
    if (!demonstratesRoleSpecificity(`${firstTouchBody}\n${followUpBody}`, buyer)) return null;
    const hello = `Hi ${firstName(buyer.name)},`;
    return {
      recipientName: buyer.name,
      recipientTitle: buyer.title || null,
      recipientSourceUrl: buyer.sourceUrl,
      recipientConfidence: buyer.confidence,
      roleFit: buyer.roleFit,
      composition: "buyer-specific",
      firstTouch: `${hello}\n\n${firstTouchBody}`,
      followUp: `${hello}\n\n${followUpBody}`,
      packetGeneratedAt: packet.generatedAt,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
