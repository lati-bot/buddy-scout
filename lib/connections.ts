// Connections — Tomi's LinkedIn network, the fuel for warm-path matching.
//
// The whole point: when a company hits the queue, answer "do I know someone
// here, and is it a strong intro?" A founder/CTO/hiring-manager at a small
// startup is a real warm path; a random IC at 200k-person Microsoft barely
// moves the needle. So we store connections keyed by company and score the
// STRENGTH of each potential intro by role seniority + relevance.

import { getConnectionsContainer } from "./cosmos";

export type Connection = {
  id: string;            // stable hash of profile URL (dedupe)
  companyKey: string;    // normalized company name (partition key)
  company: string;       // original company name
  firstName: string;
  lastName: string;
  name: string;
  url: string;
  email: string | null;
  position: string;
  connectedOn: string;   // as-provided date string
  strength: number;      // 0..100 warm-path strength (higher = better intro)
};

/** Normalize a company name to a match key: lowercase, strip punctuation,
 *  drop common suffixes (Inc, LLC, Ltd, Corp) and parenthetical asides. */
export function companyKey(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")               // drop "(AWS)", "(Techstars '23)"
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|plc|group|company)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SENIOR = /\b(founder|co-?founder|ceo|cto|coo|cpo|cmo|chief|president|vp|vice president|head|director|owner|partner|managing)\b/i;
const HIRING = /\b(recruit|talent|sourcer|sourcing|people|hr|acquisition|staffing)\b/i;
const MID = /\b(principal|lead|manager|senior|staff)\b/i;

/** Warm-path strength: how valuable is knowing THIS person for an intro?
 *  Seniority = can open a door. Hiring/talent = literally the buyer for Buddy.
 *  This is a heuristic on the connection alone; company-size weighting happens
 *  at match time (we don't know headcount here). */
export function warmStrength(position: string): number {
  const p = position || "";
  let s = 30; // baseline: a known human at the company
  if (SENIOR.test(p)) s += 45;      // decision-maker / door-opener
  else if (MID.test(p)) s += 20;    // some pull
  if (HIRING.test(p)) s += 25;      // recruiter/talent = the actual buyer persona
  return Math.min(100, s);
}

// tiny stable id from URL
function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "c" + (h >>> 0).toString(36);
}

/** Parse a LinkedIn "Connections.csv" export into Connection records.
 *  Skips the LinkedIn preamble/notes lines and blank rows. */
export function parseConnectionsCsv(csv: string): Connection[] {
  const lines = csv.split(/\r?\n/);
  // find the header row (starts with "First Name,")
  const headerIdx = lines.findIndex((l) => /^First Name,\s*Last Name,/.test(l));
  if (headerIdx === -1) return [];
  const out: Connection[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (!row || row.length < 7) continue;
    const [firstName, lastName, url, email, company, position, connectedOn] = row;
    if (!url || !company) continue;               // need a person + a company
    const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
    out.push({
      id: hashId(url),
      companyKey: companyKey(company),
      company: company.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name,
      url: url.trim(),
      email: email && email.trim() ? email.trim() : null,
      position: (position || "").trim(),
      connectedOn: (connectedOn || "").trim(),
      strength: warmStrength(position || ""),
    });
  }
  return out;
}

/** Minimal CSV line parser handling quoted fields with commas. */
function parseCsvLine(line: string): string[] | null {
  if (!line || !line.trim()) return null;
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** Bulk upsert connections (idempotent on profile-URL hash). */
export async function upsertConnections(conns: Connection[]): Promise<number> {
  const container = await getConnectionsContainer();
  let n = 0;
  for (const c of conns) {
    await container.items.upsert(c);
    n++;
  }
  return n;
}

/** Who do I know at this company? Returns intros sorted strongest-first. */
export async function connectionsAtCompany(companyName: string): Promise<Connection[]> {
  const key = companyKey(companyName);
  if (!key) return [];
  const container = await getConnectionsContainer();
  const { resources } = await container.items
    .query<Connection>({
      query: "SELECT * FROM c WHERE c.companyKey = @k",
      parameters: [{ name: "@k", value: key }],
    })
    .fetchAll();
  return resources.sort((a, b) => b.strength - a.strength);
}
