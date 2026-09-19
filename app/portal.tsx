"use client";
import { useState, useRef, useEffect } from "react";

// Buddy Scout portal. Three views, one client:
//   lookup  — type a company name/URL; resolve → confirm → scout
//   packet  — the numbered document (matches ui-preview.html exactly)
//   queue   — hiring companies already researched
// Talks to /api/scout. Visual language locked to Lati's approved reference.

const C = {
  ink: "#17171a", ink2: "#5c5c66", ink3: "#8e8e99",
  paper: "#faf9f7", rule: "#e2e0db", accent: "#1f5f4f", wash: "#e8f0ed",
};

type Candidate = { domain: string; name: string; hint?: string };
type Packet = {
  evidenceStatus?: "cited" | "needs-review";
  confidence: "high" | "medium" | "thin";
  verdict?: { call: "chase" | "watch" | "skip"; line: string };
  whoTheyAre: string; hiringSignal: string; wayIn: string;
  strategy: { angle: string; likelyObjection: string; counter: string };
  hook?: string; draft: string; citedFactIds: string[];
  citations?: { id: string; label: string; ref: string; claim: string }[];
  sources: { kind: string; ref: string; fetchedAt: string }[];
  tier: string; generatedAt: string;
};
type Company = {
  domain: string; name: string | null; stage: string | null; size: string | null;
  location: string | null; status: string;
  hiring: { isHiring: boolean; roles: string[]; source: string | null; seenAt: string | null };
  sources: string[]; lastCheckedAt: string | null;
  discovery?: { decision: "qualified" | "needs_review" | "excluded"; reasons: string[] } | null;
  packet?: { fast: { verdict?: { call?: "chase" | "watch" | "skip"; reason?: string } } | null };
  lastCheck?: { status: "confirmed-hiring" | "confirmed-empty" | "unavailable"; checkedAt: string; error: string | null } | null;
  buyer?: { card: BuyerCard; generatedAt: string } | null;
  outreach?: { state: "unreviewed" | "sent" | "skipped" | "replied" | "meeting"; draft: RecipientDraft | null };
};
type RecipientDraft = { recipientName: string | null; recipientTitle: string | null; recipientSourceUrl?: string | null; recipientConfidence?: "confirmed" | "likely" | "thin"; roleFit?: "founder" | "talent" | "eng" | "functional" | "other"; composition?: "buyer-specific" | "addressed-fallback"; firstTouch: string; followUp: string; packetGeneratedAt: string; generatedAt: string };
type WarmIntro = { name: string; position: string; url: string; strength: number };
type WarmPath = { warm: boolean; count?: number; boost?: number; intros: WarmIntro[] };
type BuyerWarm = { direct: boolean; directOwners?: string[]; count: number; owners?: string[]; best: (WarmIntro & { owner?: string })[] };
type BuyerCandidate = {
  name: string | null; title: string; roleFit: "founder" | "talent" | "eng" | "functional" | "other";
  why: string; city: string | null; cityBasis: "public" | "assumed-hq" | "unknown";
  confidence: "confirmed" | "likely" | "thin"; sourceUrl: string | null; warm: BuyerWarm | null;
};
type BuyerCard = {
  companyName: string; domain: string; buyers: BuyerCandidate[];
  location: { companyHq: string | null; companyHqSource: string | null; nearBase: "nyc" | "chicago" | null; note: string };
  warmSummary: string; networkOwners?: string[]; confidence: "confirmed" | "likely" | "thin"; sources: string[]; generatedAt: string; notes: string[];
};
type ScoutResp =
  | { ok: true; mode: "packet"; cached: boolean; atsFound: boolean; company: Company; packet: Packet | null; warmPath?: WarmPath }
  | { ok: true; mode: "resolve"; candidates: Candidate[] }
  | { ok: false; mode?: string; error: string };

const LogoMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{ flex: "none", color: C.ink }}>
    <g fill="currentColor">
      <circle cx="17" cy="32" r="13" /><circle cx="47" cy="32" r="13" />
      <rect x="17" y="26" width="30" height="12" />
    </g>
  </svg>
);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function roleFitSummary(roles: string[]): { eligible: string[]; leadershipOnly: boolean } {
  const leadership = /\b(vice president|vp\.?|head of|director|chief|ceo|cto|cfo|coo|cmo|cpo|cro|president)\b/i;
  const clean = roles.map(role => role.trim()).filter(Boolean);
  const eligible = clean.filter(role => /\bfounding\b/i.test(role) || !leadership.test(role));
  return { eligible, leadershipOnly: clean.length > 0 && eligible.length === 0 };
}

function hiringSetup(source: string | null): string {
  const s = (source ?? "").toLowerCase();
  if (s.includes("ashby")) return "Ashby detected · direct integration fit";
  if (s.includes("greenhouse")) return "Greenhouse detected · direct integration fit";
  if (s.includes("lever")) return "Lever detected · integration path needs confirmation";
  if (source) return "Hiring system detected · integration path needs confirmation";
  return "No public ATS confirmed · verify a Notion or email-to-apply workflow before positioning Buddy as the candidate system";
}

export default function Portal() {
  const [view, setView] = useState<"lookup" | "packet" | "queue">("queue");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [cached, setCached] = useState(false);
  const [warmPath, setWarmPath] = useState<WarmPath | null>(null);
  const [copied, setCopied] = useState(false);
  const [buyerCard, setBuyerCard] = useState<BuyerCard | null>(null);
  const [buyerBusy, setBuyerBusy] = useState(false);
  const [buyerErr, setBuyerErr] = useState<string | null>(null);
  const [recipientDraft, setRecipientDraft] = useState<RecipientDraft | null>(null);

  const requestId = useRef(0);
  const activeDomain = useRef<string | null>(null);
  const buyerRequestId = useRef(0);
  const [actionBusy, setActionBusy] = useState(false);
  function navigate(v: "lookup" | "queue") {
    requestId.current++; buyerRequestId.current++; activeDomain.current = null;
    setBusy(false); setBuyerBusy(false); setActionBusy(false); setError(null); setView(v);
  }

  async function findBuyer(c: Company) {
    const token = requestId.current;
    const buyerToken = ++buyerRequestId.current;
    const current = () => token === requestId.current && buyerToken === buyerRequestId.current && activeDomain.current === c.domain;
    setRecipientDraft(null);
    setBuyerBusy(true); setBuyerErr(null); setBuyerCard(null);
    try {
      const r = await fetch("/api/buyer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: c.domain, name: c.name }),
      });
      const j = await r.json();
      if (!current()) return;
      if (!j.ok) setBuyerErr(j.error || "Buyer research failed.");
      else {
        setBuyerCard(j.card);
        setRecipientDraft(j.draft ?? null);
        if (j.company) { setCompany(j.company); setPacket(j.company.lastCheck?.status === "confirmed-hiring" ? j.company.packet?.fast ?? null : null); }
      }
    } catch (e) { if (current()) setBuyerErr(String(e)); }
    finally { if (current()) setBuyerBusy(false); }
  }

  async function post(body: Record<string, unknown>): Promise<ScoutResp> {
    const r = await fetch("/api/scout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function run(body: Record<string, unknown>) {
    const token = ++requestId.current;
    buyerRequestId.current++; activeDomain.current = null; setBuyerBusy(false); setActionBusy(false);
    setBusy(true); setError(null); setCandidates(null);
    try {
      const res = await post(body);
      if (token !== requestId.current) return;
      if (!res.ok) { setError(res.error); return; }
      if (res.mode === "resolve") { setCandidates(res.candidates); return; }
      activeDomain.current = res.company.domain;
      setCompany(res.company); setPacket(res.packet); setCached(res.cached);
      setWarmPath(res.warmPath ?? null);
      setBuyerCard((res.company.buyer?.card as BuyerCard | undefined) ?? null);
      setRecipientDraft(res.company.outreach?.draft ?? null);
      setBuyerErr(null);
      setView("packet");
      if (res.packet && !res.company.buyer?.card) void findBuyer(res.company);
    } catch (e) {
      if (token === requestId.current) setError(String(e));
    } finally {
      if (token === requestId.current) setBusy(false);
    }
  }

  const onLookup = (e: React.FormEvent) => { e.preventDefault(); if (input.trim()) run({ input: input.trim() }); };
  const pick = (c: Candidate) => run({ domain: c.domain, name: c.name });

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* header */}
      <header style={{ borderBottom: `1px solid ${C.rule}`, padding: "14px 28px", display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 680, letterSpacing: "-.02em" }}>
          <LogoMark size={20} />
          <div>Buddy <span style={{ color: C.ink3, fontWeight: 500 }}>Scout</span></div>
        </div>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 20, fontSize: 13.5, color: C.ink2 }}>
          {(["queue", "lookup"] as const).map((v) => (
            <a key={v} onClick={() => navigate(v)} style={{
              cursor: "pointer", paddingBottom: 2, textTransform: "capitalize",
              color: view === v ? C.ink : "inherit",
              boxShadow: view === v ? `inset 0 -2px 0 ${C.accent}` : "none",
            }}>{v === "lookup" ? "New lookup" : "Today"}</a>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 28px 80px" }}>
        {view === "lookup" && (
          <LookupView
            input={input} setInput={setInput} onSubmit={onLookup} busy={busy}
            error={error} candidates={candidates} pick={pick}
          />
        )}
        {view === "packet" && company && (
          <PacketView
            company={company} packet={packet} cached={cached} warmPath={warmPath}
            copied={copied} onCopy={() => { if (packet) { navigator.clipboard.writeText(packet.draft); setCopied(true); setTimeout(() => setCopied(false), 1600); } }}
            onCopyText={(t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
            onBack={() => navigate("lookup")}
            buyerCard={buyerCard} buyerBusy={buyerBusy} buyerErr={buyerErr}
            recipientDraft={recipientDraft} actionBusy={actionBusy} actionError={error}
            onFindBuyer={() => company && findBuyer(company)}
            onAction={async (action) => {
              if (actionBusy) return;
              const token = requestId.current;
              const domain = company.domain;
              const current = () => token === requestId.current && activeDomain.current === domain;
              setActionBusy(true); setError(null);
              try {
                const r = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, action }) });
                const j = await r.json();
                if (!current()) return;
                if (j.ok) {
                  setCompany(j.company); setRecipientDraft(j.company.outreach?.draft ?? null);
                  setPacket(j.company.lastCheck?.status === "confirmed-hiring" ? j.company.packet?.fast ?? null : null);
                } else setError(j.error || "Could not save action.");
              } catch (e) { if (current()) setError(String(e)); }
              finally { if (current()) setActionBusy(false); }
            }}
          />
        )}
        {view === "queue" && <QueueView onOpen={(d) => run({ input: d })} busy={busy} />}
      </main>
    </div>
  );
}

/* ---------- Lookup + confirm ---------- */
function LookupView(props: {
  input: string; setInput: (s: string) => void; onSubmit: (e: React.FormEvent) => void;
  busy: boolean; error: string | null; candidates: Candidate[] | null;
  pick: (c: Candidate) => void;
}) {
  const { input, setInput, onSubmit, busy, error, candidates, pick } = props;
  return (
    <>
      <div style={{ fontSize: 11.5, letterSpacing: ".11em", textTransform: "uppercase", color: C.ink3 }}>New lookup</div>
      <h1 style={{ fontSize: 27, letterSpacing: "-.025em", margin: ".35rem 0 .5rem", fontWeight: 640 }}>Scout a company</h1>
      <p style={{ color: C.ink2, fontSize: 14, maxWidth: "62ch" }}>
        Paste the company&rsquo;s website. We look for current hiring evidence, show our sources, and prepare a draft for your review. Buyer research checks who to approach. A company name works too, but confirm the website before proceeding.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, margin: "22px 0 6px" }}>
        <input
          autoFocus value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. rain.xyz  (or a company name)"
          style={{
            flex: 1, padding: "11px 13px", border: `1px solid ${C.rule}`, borderRadius: 2,
            fontSize: 15, fontFamily: "inherit", background: "#fff", color: C.ink, outline: "none",
          }}
        />
        <button type="submit" disabled={busy} style={{
          font: "inherit", fontSize: 14, fontWeight: 550, padding: "0 18px", borderRadius: 2,
          border: `1px solid ${C.accent}`, background: C.accent, color: "#fff",
          cursor: busy ? "wait" : "pointer", opacity: busy ? 0.55 : 1,
        }}>{busy ? "Scouting…" : "Scout"}</button>
      </form>

      {error && (
        <div style={{ borderLeft: `2px solid #a33`, padding: "8px 0 8px 14px", margin: "14px 0", color: C.ink2, fontSize: 14 }}>
          {error}
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink3, marginBottom: 8 }}>
            Which one?
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {candidates.map((c) => (
              <li key={c.domain} onClick={() => pick(c)} style={{
                padding: "11px 0", borderBottom: `1px solid ${C.rule}`, cursor: "pointer",
                display: "flex", gap: 14, alignItems: "baseline",
              }}>
                <b style={{ fontWeight: 600, minWidth: 150 }}>{c.name}</b>
                <span style={{ color: C.ink2, fontSize: 14 }}>
                  {c.domain}{c.hint ? <span style={{ color: C.ink3 }}> — {c.hint}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12, fontSize: 13, color: C.ink3 }}>
            None of these? Type the exact website above (e.g. <code>devdifference.io</code>) and hit Scout — a full URL always wins.
          </div>
        </div>
      )}


    </>
  );
}

/* ---------- Packet document ---------- */
function PacketView(props: {
  company: Company; packet: Packet | null; cached: boolean;
  warmPath: WarmPath | null;
  copied: boolean; onCopy: () => void; onCopyText: (t: string) => void; onBack: () => void;  buyerCard: BuyerCard | null; buyerBusy: boolean; buyerErr: string | null; onFindBuyer: () => void;
  recipientDraft: RecipientDraft | null;
  actionBusy: boolean; actionError: string | null;
  onAction: (action: "sent" | "skipped" | "replied" | "meeting" | "restored") => Promise<void>;
}) {
  const { company, packet, cached, warmPath, copied, onCopy, onCopyText, onBack, buyerCard, buyerBusy, buyerErr, onFindBuyer, recipientDraft, onAction, actionBusy, actionError } = props;  const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
  const signalAge = Date.now() - Date.parse(company.hiring.seenAt ?? "");
  const hiring = company.hiring.isHiring && company.lastCheck?.status === "confirmed-hiring" && signalAge >= 0 && signalAge <= 3 * 86400_000;
  const roleFit = roleFitSummary(company.hiring.roles);
  const conf = hiring ? packet?.confidence ?? "thin" : "thin";
  const usableDraft = recipientDraft && hiring && packet?.evidenceStatus === "cited" &&
    recipientDraft.packetGeneratedAt === packet.generatedAt && recipientDraft.firstTouch.trim() &&
    recipientDraft.followUp.trim() && recipientDraft.composition === "buyer-specific" &&
    (!company.discovery || company.discovery.decision === "qualified");

  const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
    <section style={{ margin: "0 0 30px", paddingLeft: 34, position: "relative" }}>
      <span style={{ position: "absolute", left: 0, top: 2, color: C.ink3, fontSize: 12, ...num }}>{n}</span>
      <h2 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink3, fontWeight: 600, margin: "0 0 8px" }}>{title}</h2>
      {children}
    </section>
  );

  return (
    <>
      <div style={{ fontSize: 11.5, letterSpacing: ".11em", textTransform: "uppercase", color: C.ink3, display: "flex", gap: 12 }}>
        <span onClick={onBack} style={{ cursor: "pointer" }}>&larr; New lookup</span>
        <span>Packet · {packet?.tier === "mid" ? "deep pass" : "fast pass"}{cached ? " · cached" : ""}</span>
      </div>
      <h1 style={{ fontSize: 27, letterSpacing: "-.025em", margin: ".35rem 0 .5rem", fontWeight: 640 }}>
        {company.name ?? company.domain}
        <span style={{
          display: "inline-block", fontSize: 11.5, letterSpacing: ".05em", textTransform: "uppercase",
          padding: "3px 8px", borderRadius: 2, fontWeight: 600, verticalAlign: 3, marginLeft: 10,
          border: `1px solid ${hiring ? C.accent : C.rule}`,
          color: hiring ? C.accent : C.ink3, background: hiring ? C.wash : "none",
        }}>{hiring ? "Hiring verified" : company.lastCheck?.status === "confirmed-empty" ? "No listed roles" : "Needs recheck"}</span>
      </h1>
      <p style={{ color: C.ink2, fontSize: 14 }}>
        <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" style={{ color: C.ink2 }}>{company.domain}</a>
        {company.stage ? <>&nbsp;·&nbsp;{company.stage}</> : null}
        {company.location ? <>&nbsp;·&nbsp;{company.location}</> : null}
      </p>

      {company.lastCheck?.status === "unavailable" && <p style={{ color: "#a33" }}>The latest hiring check failed. Previous evidence is historical, not a current send recommendation.</p>}
      {company.discovery && company.discovery.decision !== "qualified" && <p style={{ color: "#8a6d1f" }}>ICP: {company.discovery.decision === "excluded" ? "outside the current target" : "needs research"}. {company.discovery.reasons.join(". ")}</p>}
      <dl style={{ display: "flex", gap: 34, margin: "22px 0 34px", padding: "14px 0", borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`, ...num }}>
        {[
          ["Last checked", fmtDate(company.lastCheckedAt)],
          ["Signal seen", company.hiring.seenAt ? fmtDate(company.hiring.seenAt) : "—"],
          ["Confidence", conf[0].toUpperCase() + conf.slice(1)],
        ].map(([k, v]) => (
          <div key={k} style={{ fontSize: 13 }}>
            <dt style={{ color: C.ink3, fontSize: 11.5, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 3 }}>{k}</dt>{v}
          </div>
        ))}
      </dl>

      {packet?.verdict?.line && (
        <div style={{
          margin: "18px 0 4px", padding: "14px 16px", borderRadius: 3,
          border: `1px solid ${C.rule}`,
          background: packet.verdict.call === "chase" ? "#f0f7f0" : packet.verdict.call === "skip" ? "#f7f0f0" : "#f7f5f0",
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
            color: packet.verdict.call === "chase" ? "#2c6e2c" : packet.verdict.call === "skip" ? "#9a3b3b" : "#8a6d2c",
          }}>{packet.verdict.call === "chase" ? "▶ Chase" : packet.verdict.call === "skip" ? "✕ Skip" : "◉ Watch"}</span>
          <p style={{ fontSize: 17, fontWeight: 560, lineHeight: 1.4, margin: "6px 0 0", maxWidth: "64ch", color: C.ink }}>
            {packet.verdict.line}
          </p>
        </div>
      )}

      <Section n="01" title="Who they are">
        <p style={{ fontSize: 16.5, lineHeight: 1.5, margin: "0 0 10px", maxWidth: "62ch" }}>
          {packet?.whoTheyAre ?? "—"}
        </p>
      </Section>

      <Section n="02" title="The hiring signal">
        {hiring ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            <li style={liS}><b style={liB}>Open roles</b><span>{company.hiring.roles.slice(0, 6).join(", ")}{company.hiring.roles.length > 6 ? `, +${company.hiring.roles.length - 6} more` : ""}</span></li>
            <li style={liS}><b style={liB}>Read</b><span>{packet?.hiringSignal ?? "—"}</span></li>
            <li style={liS}><b style={liB}>Role fit</b><span>{roleFit.leadershipOnly ? "Not a fit: every opening is VP/head/director/C-suite level." : `${roleFit.eligible.length} assessment-fit ${roleFit.eligible.length === 1 ? "role" : "roles"} (entry through senior, plus founding roles).`}</span></li>
            <li style={liS}><b style={liB}>Hiring setup</b><span>{hiringSetup(company.hiring.source)}</span></li>
            {company.hiring.source && <li style={liS}><b style={liB}>Source</b><span style={{ color: C.ink3, fontSize: 12.5, wordBreak: "break-all" }}>{company.hiring.source}</span></li>}
          </ul>
        ) : (
          <p style={{ color: C.ink2, maxWidth: "62ch" }}>{company.lastCheck?.status === "confirmed-empty" ? "The checked board has no listed roles. If no ATS is used, verify whether applications run through Notion or email before positioning Buddy as the candidate-management system." : "Current hiring is unconfirmed. Verify the ATS or a Notion/email-to-apply workflow before outreach."}</p>
        )}
      </Section>

      {packet && (
        <>
          <Section n="03" title="Who to approach & the way in">
            {buyerCard ? (
              <>
                <p style={{ maxWidth: "62ch", margin: "0 0 14px", color: C.ink2 }}><b>Company angle.</b> {packet.wayIn}</p>
                <BuyerCardView card={buyerCard} onRerun={onFindBuyer} />
              </>
            ) : (
              <div style={{ margin: "0 0 4px" }}>
                <p style={{ color: C.ink2, maxWidth: "62ch", margin: "0 0 12px" }}>
                  Scout is completing the buyer and way-in pass to name and source the actual person, locate them when public, and check every uploaded team LinkedIn network.
                </p>
                {!buyerBusy && <button onClick={onFindBuyer} style={{
                  font: "inherit", fontSize: 13.5, padding: "7px 15px", borderRadius: 2, cursor: "pointer",
                  border: `1px solid ${C.accent}`, background: "#fff", color: C.accent, fontWeight: 600,
                }}>Complete buyer &amp; way-in research &rarr;</button>}
                {buyerBusy && <p style={{ color: C.ink2 }}>Researching named buyers, locations, and LinkedIn warm paths…</p>}
                {buyerErr && <p style={{ color: "#b23" }}>Couldn&rsquo;t complete buyer research: {buyerErr}</p>}
              </div>
            )}
          </Section>

          <Section n="04" title="The strategy">
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}><b>The angle.</b> {packet.strategy.angle}</p>
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}><b>Likely objection.</b> {packet.strategy.likelyObjection}</p>
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}><b>Counter.</b> {packet.strategy.counter}</p>
          </Section>

          <Section n="05" title="Working copy · not send-ready">
            <p style={{ color: "#8a6d1f", maxWidth: "62ch" }}>This company-level copy is reference material. The send-ready version appears only after Scout verifies a named, sourced buyer and composes the addressed draft below.</p>
            {packet.hook && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.ink3, marginBottom: 6 }}>First-message concept · preview only</div>
                <div style={{ background: C.wash, border: `1px solid ${C.accent}`, padding: "16px 18px", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.ink }}>
                  {packet.hook}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.ink3, marginBottom: 6 }}>Fuller follow-up</div>
            <div style={{ background: "#fff", border: `1px solid ${C.rule}`, padding: "18px 20px", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {packet.draft}
            </div>
            {packet.citations && packet.citations.length > 0 ? (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.ink3, marginBottom: 8 }}>Backed by</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {packet.citations.map((c) => (
                    <li key={c.id} style={{ margin: "0 0 7px", fontSize: 12.5, lineHeight: 1.5, display: "flex", gap: 8 }}>
                      <span style={{ flex: "none", fontSize: 11, fontWeight: 600, color: C.accent, background: C.wash, border: `1px solid ${C.accent}`, borderRadius: 2, padding: "1px 6px", height: "fit-content" }}>{c.label}</span>
                      <span style={{ color: C.ink2 }}>
                        {c.claim}
                        {c.ref && /^https?:\/\//.test(c.ref) && (
                          <>{" "}<a href={c.ref} target="_blank" rel="noreferrer" style={{ color: C.ink3, textDecoration: "underline" }}>verify</a></>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={{ marginTop: 12, color: C.ink3, fontSize: 12.5 }}>
                No source citations were returned. Review this copy before sending.
              </div>
            )}
          </Section>
        </>
      )}

      {usableDraft && recipientDraft && (
        <Section n="06" title="Addressed draft · review before sending">
          <p style={{ color: C.ink2, fontSize: 13.5, margin: "0 0 10px" }}>
            Addressed to <b>{recipientDraft.recipientName}</b>{recipientDraft.recipientTitle ? `, ${recipientDraft.recipientTitle}` : ""}. Scout records your decision but never sends for you.
          </p>
          <div style={{ background: C.wash, border: `1px solid ${C.accent}`, padding: "16px 18px", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {recipientDraft.firstTouch}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => onCopyText(recipientDraft.firstTouch)} style={primaryButton}>{copied ? "Copied ✓" : "Copy message"}</button>

          </div>

        </Section>
      )}

      <Section n="07" title="Your decision">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={actionBusy} onClick={() => onAction("skipped")} style={secondaryButton}>Skip</button>
          <button disabled={actionBusy} onClick={() => onAction("sent")} style={secondaryButton}>Mark sent</button>
          <button disabled={actionBusy} onClick={() => onAction("replied")} style={secondaryButton}>Mark replied</button>
          <button disabled={actionBusy} onClick={() => onAction("meeting")} style={secondaryButton}>Meeting booked</button>
          {company.outreach?.state !== "unreviewed" && <button disabled={actionBusy || company.status === "closed"} onClick={() => onAction("restored")} style={secondaryButton}>Restore</button>}
        </div>
        <p style={{ color: C.ink2, fontSize: 13 }}>Status: {company.outreach?.state ?? company.status}. Recording a decision never sends a message.</p>
        {actionError && <p style={{ color: "#a33" }}>{actionError}</p>}
      </Section>

      <footer style={{ borderTop: `1px solid ${C.rule}`, marginTop: 44, paddingTop: 14, display: "flex", justifyContent: "space-between", color: C.ink3, fontSize: 12.5, ...num }}>
        <span>{packet ? <>Packet generated {new Date(packet.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</> : "No packet"}</span>
        <span>{(packet?.sources.length ?? company.sources.length)} sources</span>
      </footer>
    </>
  );
}
const liS: React.CSSProperties = { padding: "7px 0", borderBottom: `1px solid ${C.rule}`, display: "flex", gap: 14, fontSize: 14 };
const liB: React.CSSProperties = { fontWeight: 600, minWidth: 110, color: C.ink2 };
const primaryButton: React.CSSProperties = { font: "inherit", fontSize: 13.5, padding: "7px 15px", borderRadius: 2, cursor: "pointer", border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontWeight: 550 };
const secondaryButton: React.CSSProperties = { font: "inherit", fontSize: 13.5, padding: "7px 15px", borderRadius: 2, cursor: "pointer", border: `1px solid ${C.rule}`, background: "#fff", color: C.ink, fontWeight: 550 };

/* ---------- Buyer Card (deep pass) ---------- */
function BuyerCardView({ card, onRerun }: { card: BuyerCard; onRerun: () => void }) {
  const fitLabel: Record<string, string> = { founder: "Founder / CEO", talent: "Talent / People", eng: "Engineering", functional: "Functional leader", other: "Other" };
  const confChip = (c: string) => {
    const map: Record<string, { bg: string; fg: string; t: string }> = {
      confirmed: { bg: C.wash, fg: C.accent, t: "confirmed" },
      likely: { bg: "none", fg: C.ink2, t: "likely" },
      thin: { bg: "none", fg: C.ink3, t: "role target" },
    };
    const s = map[c] ?? map.thin;
    return (
      <span style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", padding: "2px 6px",
        borderRadius: 2, border: `1px solid ${s.fg === C.accent ? C.accent : C.rule}`, color: s.fg, background: s.bg, fontWeight: 600 }}>{s.t}</span>
    );
  };

  return (
    <div>
      {/* location line, relative to her two bases */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 14px", fontSize: 13.5 }}>
        <span style={{
          fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 2, fontWeight: 600,
          border: `1px solid ${card.location.nearBase ? C.accent : C.rule}`,
          color: card.location.nearBase ? C.accent : C.ink3, background: card.location.nearBase ? C.wash : "none",
        }}>{card.location.nearBase ? `near you · ${card.location.nearBase.toUpperCase()}` : "remote"}</span>
        <span style={{ color: C.ink2 }}>{card.location.note}</span>
      </div>

      {/* warm-path top line */}
      <p style={{ maxWidth: "62ch", margin: "0 0 16px", color: C.ink }}>{card.warmSummary}</p>

      {card.buyers.length === 0 && (
        <div style={{ borderLeft: "2px solid #8a6d1f", padding: "7px 0 7px 14px", margin: "0 0 14px", color: C.ink2 }}>
          <b>Not send-ready.</b> Scout did not verify a named buyer with a public source.
        </div>
      )}

      {/* ranked buyers */}
      <ol style={{ listStyle: "none", padding: 0, margin: "0 0 12px", counterReset: "b" }}>
        {card.buyers.map((b, i) => (
          <li key={i} style={{ border: `1px solid ${C.rule}`, borderLeft: `2px solid ${i === 0 ? C.accent : C.rule}`,
            padding: "12px 14px", margin: "0 0 10px", background: i === 0 ? C.wash : "#fff" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>
                {b.name ?? <span style={{ color: C.ink2, fontStyle: "italic" }}>{b.title}</span>}
              </b>
              {b.name && <span style={{ color: C.ink2, fontSize: 13.5 }}>{b.title}</span>}
              {confChip(b.confidence)}
              {i === 0 && <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>approach first</span>}
            </div>
            <div style={{ fontSize: 11.5, color: C.ink3, letterSpacing: ".04em", textTransform: "uppercase", margin: "4px 0 6px" }}>{fitLabel[b.roleFit]}</div>
            <p style={{ margin: "0 0 6px", fontSize: 13.5, color: C.ink, maxWidth: "60ch" }}>{b.why}</p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.ink2 }}>
              {b.city && (
                <span>📍 {b.city}{b.cityBasis === "assumed-hq" ? <span style={{ color: C.ink3 }}> (assumed from HQ)</span> : b.cityBasis === "public" ? "" : ""}</span>
              )}
              {b.warm?.direct ? (
                <span style={{ color: C.accent, fontWeight: 600 }}>{b.warm.directOwners?.length ? `${b.warm.directOwners.join(" & ")} know${b.warm.directOwners.length === 1 ? "s" : ""} them` : "You know them directly"}</span>
              ) : b.warm && b.warm.count > 0 ? (
                <span>{b.warm.count} mutual{b.warm.best[0] ? ` · ${b.warm.best[0].name} (${b.warm.best[0].position})${b.warm.best[0].owner ? ` via ${b.warm.best[0].owner}` : ""}` : ""}</span>
              ) : (
                <span style={{ color: C.ink3 }}>no mutual — cold</span>
              )}
              {b.sourceUrl && (
                <a href={b.sourceUrl} target="_blank" rel="noreferrer" style={{ color: C.ink3, textDecoration: "underline" }}>source</a>
              )}
            </div>
          </li>
        ))}
      </ol>

      {card.notes.length > 0 && (
        <ul style={{ margin: "6px 0 12px", padding: "0 0 0 16px", color: C.ink3, fontSize: 12 }}>
          {card.notes.map((n, i) => <li key={i} style={{ margin: "0 0 3px" }}>{n}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, color: C.ink3 }}>
        <span onClick={onRerun} style={{ cursor: "pointer", textDecoration: "underline" }}>Re-run</span>
        <span>{card.sources.length} source{card.sources.length === 1 ? "" : "s"}</span>
        <span style={{ textTransform: "capitalize" }}>· {card.confidence}</span>
      </div>
    </div>
  );
}

/* ---------- Queue ---------- */
function QueueView({ onOpen, busy }: { onOpen: (d: string) => void; busy: boolean }) {
  const [rows, setRows] = useState<(Company & { heat?: string })[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"today" | "research" | "activity">("today");
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadId = useRef(0);

  async function load() {
    const token = ++loadId.current;
    setLoading(true); setRows(null); setLoadError(null);
    try {
      const r = await fetch(`/api/scout?queue=${tab}`);
      const j = await r.json();
      if (token !== loadId.current) return;
      if (!j.ok) throw new Error(j.error || "Could not load queue");
      setRows(j.companies ?? []);
    } catch (error) { if (token === loadId.current) setLoadError(String(error)); }
    if (token === loadId.current) setLoading(false);
  }
  useEffect(() => { load(); return () => { loadId.current++; }; }, [tab]);

  const callColor: Record<string, string> = {
    chase: C.accent, watch: "#8a6d1f", skip: C.ink3,
  };
  const callBg: Record<string, string> = {
    chase: C.wash, watch: "#f3ecd8", skip: "none",
  };

  return (
    <>
      <div style={{ fontSize: 11.5, letterSpacing: ".11em", textTransform: "uppercase", color: C.ink3 }}>Today</div>
      <h1 style={{ fontSize: 27, letterSpacing: "-.025em", margin: ".35rem 0 .5rem", fontWeight: 640 }}>Who to hit today</h1>
      <p style={{ color: C.ink2, fontSize: 14 }}>Untouched chase recommendations with recent hiring evidence, strongest first. Buyer research and unknown ICP details remain visible; review the draft before sending.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {(["today", "research", "activity"] as const).map(value => <button key={value} onClick={() => setTab(value)} style={tab === value ? primaryButton : secondaryButton}>{value === "today" ? "Today" : value === "research" ? "Needs research / Watch" : "Activity"}</button>)}
      </div>
      {loadError && <p style={{ color: "#a33" }}>{loadError}</p>}
      {loading && <p style={{ color: C.ink3, marginTop: 20 }}>Loading…</p>}
      {rows && rows.length === 0 && <p style={{ color: C.ink3, marginTop: 20 }}>{tab === "today" ? "No chase recommendations meet the current checks. See Needs research / Watch for incomplete prospects." : "Nothing in this view yet."}</p>}
      {rows && rows.length > 0 && (
        <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none" }}>
          {rows.map((c) => {
            const call = c.packet?.fast?.verdict?.call ?? ((c.heat === "hot" || c.heat === "warm") ? "chase" : "watch");
            return (
              <li key={c.domain} onClick={() => !busy && onOpen(c.domain)} style={{
                padding: "12px 0", borderBottom: `1px solid ${C.rule}`, cursor: "pointer",
                display: "flex", gap: 14, alignItems: "baseline",
              }}>
                <span style={{
                  fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600,
                  padding: "2px 7px", borderRadius: 2, minWidth: 42, textAlign: "center",
                  color: callColor[call], background: callBg[call],
                  border: `1px solid ${call === "chase" ? C.accent : call === "watch" ? "#d8c896" : C.rule}`,
                }}>{tab === "activity" ? c.outreach?.state ?? c.status : c.discovery?.decision === "needs_review" ? "Review" : call}</span>
                <b style={{ fontWeight: 600, minWidth: 150 }}>{c.name ?? c.domain}</b>
                <span style={{ color: C.ink2, fontSize: 14, flex: 1 }}>{c.hiring.roles.slice(0, 3).join(", ") || c.domain}</span>
                <span style={{ color: C.ink3, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{fmtDate(c.lastCheckedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
