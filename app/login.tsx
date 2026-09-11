"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      window.location.reload();
    } else {
      const d = await r.json().catch(() => ({}));
      setErr(d?.error || "Wrong password.");
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", padding: "80px 22px" }}>
      <h1 style={{ fontSize: 30, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
        Buddy Scout
      </h1>
      <p style={{ color: "#6b675e", margin: "0 0 28px", fontSize: 15 }}>
        Sign in to continue.
      </p>
      <form
        onSubmit={submit}
        style={{
          border: "1px solid #e3e0d8",
          borderRadius: 10,
          padding: 20,
          background: "#fff",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#8a857a",
            marginBottom: 6,
          }}
        >
          Password
        </label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "11px 12px",
            border: "1px solid #e3e0d8",
            borderRadius: 7,
            fontSize: 15,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {err && (
          <p style={{ color: "#a53a20", fontSize: 14, marginTop: 10 }}>{err}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 18,
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
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
