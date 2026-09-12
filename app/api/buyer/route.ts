import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getCompany } from "@/lib/repo";
import { normalizeDomain } from "@/lib/company";
import { buildBuyerCard } from "@/lib/buyer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Web search shim (same public endpoint the scout route uses). ---
async function braveSearch(q: string) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8`,
      { headers: { "Accept": "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.web?.results ?? [];
    return hits.slice(0, 8).map((h: any) => ({
      url: h.url as string,
      title: (h.title ?? "").replace(/<[^>]+>/g, "").trim(),
      description: (h.description ?? "").replace(/<[^>]+>/g, "").trim(),
    })).filter((h: any) => h.url?.startsWith("http"));
  } catch {
    return null;
  }
}

async function webSearch(q: string) {
  const brave = await braveSearch(q);
  if (brave && brave.length) return brave;
  try {
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "BuddyScout/0.1" },
      signal: AbortSignal.timeout(8000),
    });
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

// --- Page fetch shim: pull readable text from a URL (best-effort). ---
async function fetchPage(url: string): Promise<{ url: string; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BuddyScout/0.1 (+B2B prospecting)" },
      signal: AbortSignal.timeout(9000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // strip scripts/styles, collapse tags to text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return { url: res.url || url, text };
  } catch {
    return null;
  }
}

// POST /api/buyer  { domain | name }  -> deep Buyer Card for one company.
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
  const input: string = (body?.domain || body?.name || "").trim();
  if (!input) {
    return NextResponse.json({ ok: false, error: "Pass { domain } or { name }." }, { status: 400 });
  }

  try {
    const domain = normalizeDomain(input);
    const existing = await getCompany(domain);
    const company = existing ?? {
      name: body?.name ?? null,
      domain,
      location: null,
    };
    const card = await buildBuyerCard(
      { name: company.name ?? domain, domain, location: (company as any).location ?? null },
      webSearch,
      fetchPage
    );
    return NextResponse.json({ ok: true, card });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Buyer research failed." }, { status: 500 });
  }
}
