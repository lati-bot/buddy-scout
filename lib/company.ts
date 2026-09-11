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
  packet: Packet;
  sources: string[];
  lastCheckedAt: string | null;
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
    packet: { fast: null, deep: null, generatedAt: null },
    sources: [],
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
