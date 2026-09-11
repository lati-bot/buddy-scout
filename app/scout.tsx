"use client";
import { useState } from "react";
import Logo from "./logo";

type Seed = {
  company: string;
  domain: string;
  contactName: string;
  contactTitle: string;
  role: string;
  bucket: string;
};

type Result = {
  ok: boolean;
  error?: string;
  company?: string;
  contactName?: string;
  contactTitle?: string;
  email?: string | null;
  verification?: string | null;
  found?: boolean;
  reason?: string | null;
  channel?: string;
  angleLabel?: string;
  angleBody?: string;
};

const ACCENT = "#c8492e";
const LINE = "#e3e0d8";
const PAPER = "#faf8f3";

export default function Scout({ seed }: { seed: Seed[] }) {
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [cname, setCname] = useState("");
  const [ctitle, setCtitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function prefill(s: Seed) {
    setCompany(s.company);
    setDomain(s.domain);
    setCname(s.contactName);
    setCtitle(s.contactTitle);
    setResult(null);
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          domain,
          contactName: cname,
          contactTitle: ctitle,
        }),
      });
      setResult(await r.json());
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    }
    setBusy(false);
  }

  const label: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#8a857a",
    margin: "14px 0 5px",
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    border: `1px solid ${LINE}`,
    borderRadius: 7,
    fontSize: 15,
    fontFamily: "inherit",
    background: "#fff",
    boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 22px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Logo size={44} />
        <h1 style={{ fontSize: 30, margin: 0, letterSpacing: "-0.02em" }}>
          Buddy Scout
        </h1>
      </div>
      <p style={{ color: "#6b675e", margin: "0 0 24px", fontSize: 15 }}>
        Type a company. Get the right person to reach, their verified email, and
        how to pitch Buddy to them.
      </p>

      <form
        onSubmit={run}
        style={{
          border: `1px solid ${LINE}`,
          borderRadius: 10,
          padding: 20,
          background: "#fff",
        }}
      >
        <label style={{ ...label, marginTop: 0 }}>Company name</label>
        <input
          style={input}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="e.g. Protege"
          required
        />

        <label style={label}>Website</label>
        <input
          style={input}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. withprotege.ai"
          required
        />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Contact name</label>
            <input
              style={input}
              value={cname}
              onChange={(e) => setCname(e.target.value)}
              placeholder="e.g. Bobby Samuels"
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Their title</label>
            <input
              style={input}
              value={ctitle}
              onChange={(e) => setCtitle(e.target.value)}
              placeholder="e.g. CEO"
            />
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#8a857a", marginTop: 8 }}>
          Not sure who? Small startup &rarr; the founder/CEO. Bigger team &rarr;
          Head of Talent or a recruiter.
        </p>

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 13,
            border: 0,
            borderRadius: 7,
            background: "#1a1a1a",
            color: "#fff",
            fontSize: 16,
            fontFamily: "inherit",
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Scouting…" : "Find & verify"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 26 }}>
          {!result.ok ? (
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderLeft: `4px solid ${ACCENT}`,
                borderRadius: 8,
                padding: "16px 20px",
                background: "#fff",
              }}
            >
              {result.error}
            </div>
          ) : (
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderLeft: `4px solid ${ACCENT}`,
                borderRadius: 8,
                padding: "18px 20px",
                background: "#fff",
              }}
            >
              <h2 style={{ margin: "0 0 2px", fontSize: 21 }}>
                {result.contactName}
              </h2>
              <div style={{ color: "#8a857a", fontSize: 14 }}>
                {result.contactTitle} &middot; {result.company}
              </div>
              <div style={{ marginTop: 12 }}>
                {result.found ? (
                  <span>
                    <span
                      style={{
                        fontFamily: '"SF Mono", Menlo, monospace',
                        fontSize: 15,
                        background: PAPER,
                        padding: "3px 7px",
                        borderRadius: 5,
                      }}
                    >
                      {result.email}
                    </span>{" "}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "2px 9px",
                        borderRadius: 20,
                        background: "#e6f2e6",
                        color: "#2c6e2c",
                      }}
                    >
                      {result.verification || "VERIFIED"}
                    </span>
                  </span>
                ) : (
                  <div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "2px 9px",
                        borderRadius: 20,
                        background: "#f7e9e5",
                        color: "#a53a20",
                      }}
                    >
                      No email on file yet
                    </span>
                    <div
                      style={{ color: "#8a857a", fontSize: 14, marginTop: 6 }}
                    >
                      {result.reason ||
                        "Try LinkedIn first; a fallback provider can fill this later."}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ color: "#8a857a", fontSize: 14, marginTop: 10 }}>
                Reach via: {result.channel}
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px dashed ${LINE}`,
                }}
              >
                <b style={{ color: ACCENT }}>{result.angleLabel}.</b>{" "}
                {result.angleBody}
              </div>
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 40, fontSize: 15, color: "#6b675e" }}>
        NYC list — click to load
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {seed.map((s) => (
          <button
            key={s.company}
            onClick={() => prefill(s)}
            style={{
              border: `1px solid ${LINE}`,
              borderRadius: 20,
              padding: "6px 12px",
              background: "#fff",
              fontFamily: "inherit",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {s.company}
          </button>
        ))}
      </div>
    </div>
  );
}
