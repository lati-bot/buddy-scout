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
