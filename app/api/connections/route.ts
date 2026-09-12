import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import {
  parseConnectionsCsv,
  upsertConnections,
  connectionsAtCompany,
} from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/connections?company=Acme -> who do I know there (warm-path lookup)
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const company = new URL(req.url).searchParams.get("company");
  if (!company) {
    return NextResponse.json({ ok: false, error: "Pass ?company=" }, { status: 400 });
  }
  try {
    const intros = await connectionsAtCompany(company);
    return NextResponse.json({ ok: true, company, count: intros.length, intros });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST /api/connections  { csv: "<LinkedIn Connections.csv contents>" }
// Ingest Tomi's (or Jolene's) LinkedIn export. Personal network data — authed
// only, stored in Cosmos behind keys, never in the repo. Idempotent: re-uploading
// the same export just upserts (no dupes).
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
  const csv: string = body?.csv || "";
  const owner: string = (body?.owner || "Tomi").toString().trim() || "Tomi";
  if (!csv || csv.length < 20) {
    return NextResponse.json(
      { ok: false, error: "Send the CSV text in { csv }." },
      { status: 400 }
    );
  }
  try {
    const conns = parseConnectionsCsv(csv, owner);
    if (!conns.length) {
      return NextResponse.json(
        { ok: false, error: "No connections parsed — is this a LinkedIn Connections.csv?" },
        { status: 422 }
      );
    }
    const n = await upsertConnections(conns);
    // Quick shape of what came in, so we can eyeball quality.
    const companies = new Set(conns.map((c) => c.companyKey)).size;
    const strong = conns.filter((c) => c.strength >= 70).length;
    return NextResponse.json({
      ok: true,
      owner,
      ingested: n,
      companies,
      strongIntros: strong,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
