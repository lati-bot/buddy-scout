import type { Company } from "./company";

export type ResearchUpdate = Pick<Company, "hiring" | "lastCheck" | "lastCheckedAt" | "packet" | "sources">;

/** Merge only research-owned fields into the latest row; human decisions/events always survive. */
export function applyResearchUpdate(current: Company, update: ResearchUpdate): Company {
  if (Date.parse(current.lastCheck?.checkedAt ?? "") > Date.parse(update.lastCheck?.checkedAt ?? "")) return current;
  const next = { ...current, ...update };
  if (update.lastCheck?.status === "unavailable") {
    next.hiring = current.hiring; // keep historical evidence without claiming it is current
    next.packet = current.packet;
    next.sources = current.sources;
  }
  if (current.status === "new" || current.status === "watching" || current.status === "hiring") {
    next.status = update.lastCheck?.status === "confirmed-hiring" ? "hiring" : "watching";
  }
  // Any hiring/packet refresh invalidates recipient copy. Buyer-specific composition
  // runs again only after the refreshed packet passes the readiness gate.
  next.outreach = { state: current.outreach?.state ?? "unreviewed", events: current.outreach?.events ?? [], draft: null };
  return next;
}

export function hasFreshSuccessfulCheck(company: Company, now = Date.now()): boolean {
  const age = now - Date.parse(company.lastCheck?.checkedAt ?? "");
  return age >= 0 && age < 6 * 60 * 60_000 &&
    (company.lastCheck?.status === "confirmed-empty" ||
      (company.lastCheck?.status === "confirmed-hiring" && Boolean(company.packet.fast)));
}
