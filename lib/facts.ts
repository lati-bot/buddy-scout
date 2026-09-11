// Facts bundle — the contract between research and writing (DESIGN.md §3).
//
// THE CORE INVARIANT: a Fact cannot exist without a source. The writer model is only
// ever handed Fact[] (never raw text, never the domain, never "what you know about crypto").
// So it is STRUCTURALLY unable to state anything we didn't verify. This is how we kill the
// "Solana hallucination" — not by prompting nicely, but by making unsourced claims
// un-representable. Provenance is the type system.
//
// A packet's every specific claim must trace to a Fact.id here.

export type FactKind =
  | "company"      // what they do, stage, size, location
  | "role"         // a specific open role
  | "signal"       // hiring heat / funding / pain signal
  | "contact"      // person + email
  | "warmpath";    // known connection to the company

export interface Source {
  kind: "ats" | "careers-page" | "prospeo" | "linkedin-csv" | "web" | "newsletter" | "user";
  ref: string;     // URL or identifier Jolene can check
  fetchedAt: string;
}

export interface Fact {
  id: string;                 // stable, referenced by the packet ("f3")
  kind: FactKind;
  claim: string;              // the atomic assertion, plainly stated
  source: Source;             // WHERE it came from — mandatory, no exceptions
  confidence: "high" | "medium" | "thin";
}

export interface FactsBundle {
  domain: string;
  companyName: string;
  facts: Fact[];
  gatheredAt: string;
}

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `f${_seq}`;
}

/** Start an empty bundle for a company. */
export function newBundle(domain: string, companyName: string): FactsBundle {
  return { domain, companyName, facts: [], gatheredAt: new Date().toISOString() };
}

/** Add a fact. The ONLY way to introduce a claim into the pipeline. Source is required. */
export function addFact(
  b: FactsBundle,
  kind: FactKind,
  claim: string,
  source: Source,
  confidence: Fact["confidence"] = "high"
): Fact {
  const f: Fact = { id: nextId(), kind, claim, source, confidence };
  b.facts.push(f);
  return f;
}

/** Facts of a given kind. */
export function factsOf(b: FactsBundle, kind: FactKind): Fact[] {
  return b.facts.filter((f) => f.kind === kind);
}

/** Overall bundle confidence = the honest floor. Thin if we're thin anywhere material. */
export function bundleConfidence(b: FactsBundle): "high" | "medium" | "thin" {
  const hasCompany = factsOf(b, "company").length > 0;
  const hasSignal = factsOf(b, "signal").length > 0 || factsOf(b, "role").length > 0;
  if (!hasCompany || !hasSignal) return "thin";
  const anyThin = b.facts.some((f) => f.confidence === "thin");
  const allHigh = b.facts.every((f) => f.confidence === "high");
  if (allHigh) return "high";
  return anyThin ? "thin" : "medium";
}

/**
 * Render the bundle for the writer model as a NUMBERED fact list.
 * The writer is instructed it may ONLY use these, and must cite fact ids.
 * Nothing else about the company is provided — not even the raw domain description.
 */
export function bundleToPrompt(b: FactsBundle): string {
  if (!b.facts.length) return "(no verified facts available)";
  return b.facts
    .map((f) => `[${f.id}] (${f.kind}, ${f.confidence}) ${f.claim}  — source: ${f.source.kind}:${f.source.ref}`)
    .join("\n");
}

/** For the UI: the sources footer ("4 sources"), deduped. */
export function bundleSources(b: FactsBundle): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const f of b.facts) {
    const key = `${f.source.kind}:${f.source.ref}`;
    if (!seen.has(key)) { seen.add(key); out.push(f.source); }
  }
  return out;
}
