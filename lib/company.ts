// Normalized company document. Keyed on `domain` (the unique ID).
// See PACKET-TEMPLATE.md for how these fields feed the sales packet.

export type CompanyStatus =
  | "new"
  | "watching"
  | "hiring"
  | "contacted"
  | "closed";

export interface HiringSignal {
  isHiring: boolean;
  roles: string[];
  source: string | null; // URL the signal came from
  seenAt: string | null; // ISO date
}

const LEADERSHIP_ONLY_ROLE = /\b(vice president|vp\.?|head of|director|chief|ceo|cto|cfo|coo|cmo|cpo|cro|president)\b/i;
const FOUNDING_ROLE = /\bfounding\b/i;

/**
 * Buddy's assessment sweet spot is applicant-volume hiring from entry through
 * senior IC/manager roles. Founding roles are an explicit exception because
 * early teams are unusually likely to use an assessment. A board containing
 * only VP/head/director/C-suite openings is not a Scout fit.
 */
export function assessmentRoleFit(roles: string[]): {
  eligible: string[];
  leadershipOnly: boolean;
} {
  const clean = roles.map(role => role.trim()).filter(Boolean);
  const eligible = clean.filter(role => FOUNDING_ROLE.test(role) || !LEADERSHIP_ONLY_ROLE.test(role));
  return { eligible, leadershipOnly: clean.length > 0 && eligible.length === 0 };
}

export type CheckStatus = "confirmed-hiring" | "confirmed-empty" | "unavailable";

export interface ResearchCheck {
  status: CheckStatus;
  checkedAt: string;
  error: string | null;
}

export interface Contact {
  person: string | null;
  title: string | null;
  email: string | null;
  confidence: "high" | "medium" | "thin" | null;
}

export interface WarmPath {
  connected: boolean;
  who: string | null; // team member connected
  via: string | null; // how (school, org, mutual)
}

export interface Packet {
  fast: Record<string, unknown> | null;
  deep: Record<string, unknown> | null;
  generatedAt: string | null;
}

export type OutreachState = "unreviewed" | "sent" | "skipped" | "replied" | "meeting";

export interface OutreachEvent {
  action: Exclude<OutreachState, "unreviewed"> | "restored";
  at: string;
  note: string | null;
}

export interface RecipientDraft {
  recipientName: string | null;
  recipientTitle: string | null;
  recipientSourceUrl?: string | null;
  recipientConfidence?: "confirmed" | "likely" | "thin";
  roleFit?: "founder" | "talent" | "eng" | "functional" | "other";
  composition?: "buyer-specific" | "addressed-fallback";
  firstTouch: string;
  followUp: string;
  packetGeneratedAt: string;
  generatedAt: string;
}

export interface Outreach {
  state: OutreachState;
  draft: RecipientDraft | null;
  events: OutreachEvent[];
}

export interface BuyerResearch {
  card: Record<string, unknown>;
  generatedAt: string;
}

export interface DiscoveryEvidence {
  source: string;
  sourceRef: string;
  discoveredAt: string;
  assessedAt: string;
  decision: "qualified" | "needs_review" | "excluded";
  score: number;
  reasons: string[];
}

export interface Company {
  id: string; // == domain (Cosmos item id)
  domain: string; // partition key + unique ID
  name: string | null;
  stage: string | null;
  size: string | null;
  location: string | null;
  description: string | null;
  status: CompanyStatus;
  hiring: HiringSignal;
  contact: Contact;
  warmPath: WarmPath | null;
  buyer?: BuyerResearch | null;
  outreach?: Outreach;
  discovery?: DiscoveryEvidence | null;
  packet: Packet;
  sources: string[];
  lastCheckedAt: string | null;
  lastCheck?: ResearchCheck | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- Heat model ----------
// Heat drives two things Jolene actually cares about:
//   1. Recheck cadence — hot companies checked ~daily, cold ones rarely.
//   2. Queue order — the ripest lead sits at the top when she opens the app.
// A company is HOT when it's hiring with a fresh signal and untouched by outreach.
// It cools as the signal ages or once she's already contacted them.

export type Heat = "hot" | "warm" | "cool" | "cold";

// Days between rechecks per heat tier. Hot = daily so she never pitches a dead
// role; cold = biweekly so we don't waste spend on dormant companies.
export const RECHECK_DAYS: Record<Heat, number> = {
  hot: 1,
  warm: 3,
  cool: 7,
  cold: 14,
};

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

/**
 * Classify a company's heat from its current signal.
 * - Already contacted / closed -> cool/cold (she's handled it; low re-check need).
 * - Not hiring -> cold (nothing to pitch; check rarely).
 * - Hiring: hotness decays with the age of the signal.
 */
export function heatOf(c: Company): Heat {
  if (c.status === "closed") return "cold";
  if (c.status === "contacted") return "cool";
  if (!c.hiring.isHiring) return "cold";
  const age = daysSince(c.hiring.seenAt);
  if (age <= 3) return "hot";
  if (age <= 10) return "warm";
  if (age <= 21) return "cool";
  return "cold";
}

/**
 * Ripeness score for queue ordering — higher = surface first.
 * Jolene opens the app and the freshest, most-actionable lead is on top.
 * Rewards: fresh hiring signal, more open roles, a warm path, a known contact.
 * Penalizes: staleness, already-contacted.
 */
export function ripeness(c: Company): number {
  let s = 0;
  const heat = heatOf(c);
  s += { hot: 100, warm: 60, cool: 25, cold: 0 }[heat];
  if (c.hiring.isHiring) s += Math.min(c.hiring.roles.length, 10) * 3; // more roles = bigger opening
  if (c.warmPath?.connected) s += 40;                                   // warm intro is gold
  if (c.contact.email) s += 10;                                         // ready to reach
  if (c.status === "contacted") s -= 50;                                 // already worked
  if (c.status === "closed") s -= 200;
  // Recency nudge: a signal seen today edges out one seen last week.
  s -= Math.min(daysSince(c.hiring.seenAt), 30);
  return s;
}

/** True if this company is due for a recheck given its heat tier. */
export function isDueForRecheck(c: Company): boolean {
  const due = RECHECK_DAYS[heatOf(c)];
  return daysSince(c.lastCheckedAt) >= due;
}

/** A lead whose current evidence is strong enough to spend the deeper buyer/composition pass. */
export function isBuyerResearchCandidate(c: Company, now = Date.now()): boolean {
  const seen = Date.parse(c.hiring.seenAt ?? "");
  const packetAt = Date.parse(c.packet?.generatedAt ?? "");
  const recent = (at: number) => Number.isFinite(at) && at <= now && now - at <= 3 * 86_400_000;
  return (
    (c.outreach?.state ?? "unreviewed") === "unreviewed" &&
    c.status !== "closed" && c.status !== "contacted" &&
    c.hiring.isHiring && recent(seen) && recent(packetAt) &&
    assessmentRoleFit(c.hiring.roles).eligible.length > 0 &&
    Boolean(c.packet?.fast) &&
    c.packet.fast?.evidenceStatus === "cited" &&
    c.packet.fast?.verdict != null &&
    (c.packet.fast.verdict as { call?: string }).call === "chase" &&
    c.lastCheck?.status === "confirmed-hiring" &&
    (!c.discovery || (c.discovery.decision === "qualified" &&
      now - Date.parse(c.discovery.assessedAt) <= 7 * 86_400_000))
  );
}

/** Today is not a research queue: it contains only a complete, buyer-specific send decision. */
export function isTodayCandidate(c: Company, now = Date.now()): boolean {
  const draft = c.outreach?.draft;
  return isBuyerResearchCandidate(c, now) && Boolean(
    c.buyer?.card &&
    draft?.recipientName &&
    draft.firstTouch.trim() &&
    draft.followUp.trim() &&
    draft.packetGeneratedAt === c.packet.generatedAt &&
    draft.composition === "buyer-specific"
  );
}

/** Pure state transition used by the API/repository and regression tests. */
export function applyOutreachAction(
  company: Company,
  action: Exclude<OutreachState, "unreviewed"> | "restored",
  note?: string | null,
  at = new Date().toISOString()
): Company {
  if (action === "restored" && company.status === "closed") throw new Error("Closed companies require explicit reopening before restore.");
  const current = company.outreach ?? { state: "unreviewed" as const, draft: null, events: [] };
  const state: OutreachState = action === "restored" ? "unreviewed" : action;
  if (current.state === state) return company;
  return {
    ...company,
    status:
      company.status === "closed" ? "closed" : ["sent", "replied", "meeting"].includes(action)
        ? "contacted"
        : action === "restored" && company.hiring.isHiring
        ? "hiring"
        : company.status,
    outreach: {
      ...current,
      state,
      events: [...current.events, { action, at, note: note?.trim() || null }],
    },
  };
}

/** Normalize any raw domain string into the canonical ID form. */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  return d;
}

export function newCompany(domain: string, name?: string): Company {
  const now = new Date().toISOString();
  const id = normalizeDomain(domain);
  return {
    id,
    domain: id,
    name: name ?? null,
    stage: null,
    size: null,
    location: null,
    description: null,
    status: "new",
    hiring: { isHiring: false, roles: [], source: null, seenAt: null },
    contact: { person: null, title: null, email: null, confidence: null },
    warmPath: null,
    buyer: null,
    outreach: { state: "unreviewed", draft: null, events: [] },
    discovery: null,
    packet: { fast: null, deep: null, generatedAt: null },
    sources: [],
    lastCheckedAt: null,
    lastCheck: null,
    createdAt: now,
    updatedAt: now,
  };
}
