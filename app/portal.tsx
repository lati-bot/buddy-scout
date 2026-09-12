"use client";
import { useState } from "react";

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
  confidence: "high" | "medium" | "thin";
  whoTheyAre: string; hiringSignal: string; wayIn: string;
  strategy: { angle: string; likelyObjection: string; counter: string };
  draft: string; citedFactIds: string[];
  citations?: { id: string; label: string; ref: string; claim: string }[];
  sources: { kind: string; ref: string; fetchedAt: string }[];
  tier: string; generatedAt: string;
};
type Company = {
  domain: string; name: string | null; stage: string | null; size: string | null;
  location: string | null; status: string;
  hiring: { isHiring: boolean; roles: string[]; source: string | null; seenAt: string | null };
  sources: string[]; lastCheckedAt: string | null;
};
type WarmIntro = { name: string; position: string; url: string; strength: number };
type WarmPath = { warm: boolean; count?: number; boost?: number; intros: WarmIntro[] };
type BuyerWarm = { direct: boolean; directOwners?: string[]; count: number; owners?: string[]; best: (WarmIntro & { owner?: string })[] };
type BuyerCandidate = {
  name: string | null; title: string; roleFit: "founder" | "talent" | "eng" | "other";
  why: string; city: string | null; cityBasis: "public" | "assumed-hq" | "unknown";
  confidence: "confirmed" | "likely" | "thin"; sourceUrl: string | null; warm: BuyerWarm | null;
};
type BuyerCard = {
  companyName: string; domain: string; buyers: BuyerCandidate[];
  location: { companyHq: string | null; companyHqSource: string | null; nearBase: "nyc" | "chicago" | null; note: string };
  warmSummary: string; confidence: "confirmed" | "likely" | "thin"; sources: string[]; generatedAt: string; notes: string[];
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

export default function Portal({ seed }: { seed: { company: string; domain: string }[] }) {
  const [view, setView] = useState<"lookup" | "packet" | "queue">("lookup");
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

  async function findBuyer(c: Company) {
    setBuyerBusy(true); setBuyerErr(null); setBuyerCard(null);
    try {
      const r = await fetch("/api/buyer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: c.domain, name: c.name }),
      });
      const j = await r.json();
      if (!j.ok) setBuyerErr(j.error || "Buyer research failed.");
      else setBuyerCard(j.card);
    } catch (e) { setBuyerErr(String(e)); }
    finally { setBuyerBusy(false); }
  }

  async function post(body: Record<string, unknown>): Promise<ScoutResp> {
    const r = await fetch("/api/scout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function run(body: Record<string, unknown>) {
    setBusy(true); setError(null); setCandidates(null);
    try {
      const res = await post(body);
      if (!res.ok) { setError(res.error); return; }
      if (res.mode === "resolve") { setCandidates(res.candidates); return; }
      setCompany(res.company); setPacket(res.packet); setCached(res.cached);
      setWarmPath(res.warmPath ?? null);
      setBuyerCard(null); setBuyerErr(null);
      setView("packet");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
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
            <a key={v} onClick={() => setView(v)} style={{
              cursor: "pointer", paddingBottom: 2, textTransform: "capitalize",
              color: view === v ? C.ink : "inherit",
              boxShadow: view === v ? `inset 0 -2px 0 ${C.accent}` : "none",
            }}>{v === "lookup" ? "New lookup" : v}</a>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 28px 80px" }}>
        {view === "lookup" && (
          <LookupView
            input={input} setInput={setInput} onSubmit={onLookup} busy={busy}
            error={error} candidates={candidates} pick={pick} seed={seed}
            quick={(d) => run({ input: d })}
          />
        )}
        {view === "packet" && company && (
          <PacketView
            company={company} packet={packet} cached={cached} warmPath={warmPath}
            copied={copied} onCopy={() => { if (packet) { navigator.clipboard.writeText(packet.draft); setCopied(true); setTimeout(() => setCopied(false), 1600); } }}
            onBack={() => setView("lookup")}
            buyerCard={buyerCard} buyerBusy={buyerBusy} buyerErr={buyerErr}
            onFindBuyer={() => company && findBuyer(company)}
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
  pick: (c: Candidate) => void; seed: { company: string; domain: string }[]; quick: (d: string) => void;
}) {
  const { input, setInput, onSubmit, busy, error, candidates, pick, seed, quick } = props;
  return (
    <>
      <div style={{ fontSize: 11.5, letterSpacing: ".11em", textTransform: "uppercase", color: C.ink3 }}>New lookup</div>
      <h1 style={{ fontSize: 27, letterSpacing: "-.025em", margin: ".35rem 0 .5rem", fontWeight: 640 }}>Scout a company</h1>
      <p style={{ color: C.ink2, fontSize: 14, maxWidth: "62ch" }}>
        Paste the company&rsquo;s website &mdash; you know it, so we don&rsquo;t have to guess. We check if they&rsquo;re hiring, find the way in, and write the pitch, every claim traced to a source. (A name works too, but a URL is always exact.)
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

      <div style={{ marginTop: 40, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: C.ink3 }}>
        Try one
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {seed.map((s) => (
          <button key={s.domain} onClick={() => quick(s.domain)} style={{
            border: `1px solid ${C.rule}`, borderRadius: 2, padding: "6px 12px",
            background: "#fff", fontFamily: "inherit", fontSize: 13, color: C.ink, cursor: "pointer",
          }}>{s.company}</button>
        ))}
      </div>
    </>
  );
}

/* ---------- Packet document ---------- */
function PacketView(props: {
  company: Company; packet: Packet | null; cached: boolean;
  warmPath: WarmPath | null;
  copied: boolean; onCopy: () => void; onBack: () => void;
  buyerCard: BuyerCard | null; buyerBusy: boolean; buyerErr: string | null; onFindBuyer: () => void;
}) {
  const { company, packet, cached, warmPath, copied, onCopy, onBack, buyerCard, buyerBusy, buyerErr, onFindBuyer } = props;
  const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
  const conf = packet?.confidence ?? (company.hiring.isHiring ? "medium" : "thin");
  const hiring = company.hiring.isHiring;

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
        }}>{hiring ? "Hiring now" : "No signal"}</span>
      </h1>
      <p style={{ color: C.ink2, fontSize: 14 }}>
        <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" style={{ color: C.ink2 }}>{company.domain}</a>
        {company.stage ? <>&nbsp;·&nbsp;{company.stage}</> : null}
        {company.location ? <>&nbsp;·&nbsp;{company.location}</> : null}
      </p>

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
            {company.hiring.source && <li style={liS}><b style={liB}>Source</b><span style={{ color: C.ink3, fontSize: 12.5, wordBreak: "break-all" }}>{company.hiring.source}</span></li>}
          </ul>
        ) : (
          <p style={{ color: C.ink2, maxWidth: "62ch" }}>No public ATS board found. Hiring status unconfirmed from structured data — treat as a watch, not a target.</p>
        )}
      </Section>

      {packet && (
        <>
          <Section n="03" title="The way in">
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}>{packet.wayIn}</p>
            {warmPath?.warm && warmPath.intros.length ? (
              <div style={{ borderLeft: `2px solid ${C.accent}`, padding: "6px 0 6px 14px", margin: "12px 0", color: C.ink }}>
                <b>Warm path — you know {warmPath.count} {warmPath.count === 1 ? "person" : "people"} here.</b>
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                  {warmPath.intros.map((i) => (
                    <li key={i.url} style={{ margin: "0 0 6px", fontSize: 13.5, lineHeight: 1.5 }}>
                      <a href={i.url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 600, textDecoration: "none" }}>{i.name}</a>
                      <span style={{ color: C.ink2 }}> — {i.position}</span>
                      {i.strength >= 70 && <span style={{ color: C.ink3, fontSize: 11.5 }}> · strong intro</span>}
                    </li>
                  ))}
                </ul>
                <p style={{ color: C.ink3, fontSize: 12, margin: "6px 0 0" }}>Reach out through them for a warm intro instead of going cold.</p>
              </div>
            ) : (
              <div style={{ borderLeft: `2px solid ${C.rule}`, padding: "2px 0 2px 14px", margin: "12px 0", color: C.ink2 }}>
                <b>Warm path.</b> No mutual connection found in your network — cold outreach for this one.
              </div>
            )}
          </Section>

          <Section n="04" title="The strategy">
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}><b>The angle.</b> {packet.strategy.angle}</p>
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}><b>Likely objection.</b> {packet.strategy.likelyObjection}</p>
            <p style={{ maxWidth: "62ch", margin: "0 0 10px" }}><b>Counter.</b> {packet.strategy.counter}</p>
          </Section>

          <Section n="05" title="The draft">
            <div style={{ background: "#fff", border: `1px solid ${C.rule}`, padding: "18px 20px", fontSize: 14, lineHeight: 1.65, marginTop: 10, whiteSpace: "pre-wrap" }}>
              {packet.draft}
            </div>
            <div style={{ marginTop: 14 }}>
              <button onClick={onCopy} style={{
                font: "inherit", fontSize: 13.5, padding: "7px 15px", borderRadius: 2, cursor: "pointer",
                border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontWeight: 550,
              }}>{copied ? "Copied ✓" : "Copy draft"}</button>
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
                Every claim in this draft traces to a verified fact.
              </div>
            )}
          </Section>
        </>
      )}

      {packet && (
        <Section n="06" title="Who to approach">
          {!buyerCard && !buyerBusy && (
            <div style={{ margin: "0 0 4px" }}>
              <p style={{ color: C.ink2, maxWidth: "62ch", margin: "0 0 12px" }}>
                Run a deeper research pass to name the actual decision-maker, find their city (relative to NYC / Chicago), and your warmest path in. Takes a few seconds.
              </p>
              <button onClick={onFindBuyer} style={{
                font: "inherit", fontSize: 13.5, padding: "7px 15px", borderRadius: 2, cursor: "pointer",
                border: `1px solid ${C.accent}`, background: "#fff", color: C.accent, fontWeight: 600,
              }}>Find the buyer &rarr;</button>
            </div>
          )}
          {buyerBusy && <p style={{ color: C.ink2 }}>Researching decision-makers &amp; warm paths…</p>}
          {buyerErr && <p style={{ color: "#b23" }}>Couldn&rsquo;t complete buyer research: {buyerErr}</p>}
          {buyerCard && <BuyerCardView card={buyerCard} onRerun={onFindBuyer} />}
        </Section>
      )}

      <footer style={{ borderTop: `1px solid ${C.rule}`, marginTop: 44, paddingTop: 14, display: "flex", justifyContent: "space-between", color: C.ink3, fontSize: 12.5, ...num }}>
        <span>{packet ? <>Packet generated {new Date(packet.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</> : "No packet"}</span>
        <span>{(packet?.sources.length ?? company.sources.length)} sources</span>
      </footer>
    </>
  );
}
const liS: React.CSSProperties = { padding: "7px 0", borderBottom: `1px solid ${C.rule}`, display: "flex", gap: 14, fontSize: 14 };
const liB: React.CSSProperties = { fontWeight: 600, minWidth: 110, color: C.ink2 };

/* ---------- Buyer Card (deep pass) ---------- */
function BuyerCardView({ card, onRerun }: { card: BuyerCard; onRerun: () => void }) {
  const fitLabel: Record<string, string> = { founder: "Founder / CEO", talent: "Talent / People", eng: "Engineering", other: "Other" };
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

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/scout?queue=all");
      const j = await r.json();
      setRows(j.companies ?? []);
    } catch { setRows([]); }
    setLoading(false);
  }
  if (rows === null && !loading) load();

  const heatColor: Record<string, string> = {
    hot: C.accent, warm: "#8a6d1f", cool: C.ink3, cold: C.ink3,
  };
  const heatBg: Record<string, string> = {
    hot: C.wash, warm: "#f3ecd8", cool: "none", cold: "none",
  };

  return (
    <>
      <div style={{ fontSize: 11.5, letterSpacing: ".11em", textTransform: "uppercase", color: C.ink3 }}>Queue</div>
      <h1 style={{ fontSize: 27, letterSpacing: "-.025em", margin: ".35rem 0 .5rem", fontWeight: 640 }}>Ripest first</h1>
      <p style={{ color: C.ink2, fontSize: 14 }}>Sorted by how ready each lead is to act on — freshest hiring signal, most open roles, warm paths up top. Hot leads are rechecked daily.</p>
      {loading && <p style={{ color: C.ink3, marginTop: 20 }}>Loading…</p>}
      {rows && rows.length === 0 && <p style={{ color: C.ink3, marginTop: 20 }}>Nothing in the queue yet. Run a lookup to start filling it.</p>}
      {rows && rows.length > 0 && (
        <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none" }}>
          {rows.map((c) => {
            const heat = c.heat ?? "cold";
            return (
              <li key={c.domain} onClick={() => !busy && onOpen(c.domain)} style={{
                padding: "12px 0", borderBottom: `1px solid ${C.rule}`, cursor: "pointer",
                display: "flex", gap: 14, alignItems: "baseline",
              }}>
                <span style={{
                  fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600,
                  padding: "2px 7px", borderRadius: 2, minWidth: 42, textAlign: "center",
                  color: heatColor[heat], background: heatBg[heat],
                  border: `1px solid ${heat === "hot" ? C.accent : heat === "warm" ? "#d8c896" : C.rule}`,
                }}>{heat}</span>
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
