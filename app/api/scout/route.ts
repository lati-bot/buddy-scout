import { NextRequest, NextResponse } from "next/server";
import { scout } from "@/lib/scout";
import { asDomain, resolveName } from "@/lib/resolve";
import { listByStatus, listQueue, withHeat } from "@/lib/repo";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/scout?queue=hiring|all -> ripeness-sorted queue for the Queue view.
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("queue");
  if (q) {
    try {
      // "all" spans every open status, ripeness-ordered; "hiring" narrows to
      // confirmed-hiring. Both surface the ripest lead first.
      const rows =
        q === "all" ? await listQueue(60) : await listByStatus("hiring", 60);
      const companies = rows.map(withHeat);
      return NextResponse.json({ ok: true, companies });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message, companies: [] }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: false, error: "Unknown query." }, { status: 400 });
}

// Minimal web search shim for name resolution. Uses a public search endpoint via fetch;
// swappable. Kept here so lib/resolve stays pure/testable.
async function webSearch(q: string) {
  try {
    const res = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "BuddyScout/0.1" }, signal: AbortSignal.timeout(8000) }
    );
    const html = await res.text();
    const out: Array<{ url: string; title: string; description?: string }> = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 8) {
      const url = decodeURIComponent((m[1].match(/uddg=([^&]+)/)?.[1]) ?? m[1]);
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (url.startsWith("http")) out.push({ url, title });
    }
    return out;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const input: string = (body?.company || body?.domain || body?.input || "").trim();
  if (!input) {
    return NextResponse.json({ ok: false, error: "Enter a company name or URL." }, { status: 400 });
  }

  // Mode 1: explicit domain given, or input already looks like one -> full scout.
  const domain = body?.domain?.trim() || asDomain(input);
  if (domain) {
    try {
      const result = await scout(domain, {
        name: body?.name || undefined,
        tier: body?.hot ? "mid" : "cheap",
      });
      return NextResponse.json({
        ok: true,
        mode: "packet",
        cached: result.cached,
        atsFound: result.atsFound,
        company: result.company,
        packet: result.packet,
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  // Mode 2: bare name -> resolve to candidates for the confirm panel.
  const candidates = await resolveName(input, webSearch);
  if (!candidates.length) {
    return NextResponse.json({
      ok: false,
      mode: "resolve",
      error: `Couldn't find a company site for "${input}". Try the URL.`,
    });
  }
  return NextResponse.json({ ok: true, mode: "resolve", candidates });
}
