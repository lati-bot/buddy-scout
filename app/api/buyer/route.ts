import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getCompany } from "@/lib/repo";
import { normalizeDomain } from "@/lib/company";
import { researchAndSaveBuyer } from "@/lib/buyer-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Research the company before finding its buyer." }, { status: 409 });
    }
    const saved = await researchAndSaveBuyer(existing);
    return NextResponse.json({
      ok: true,
      card: saved.buyer?.card ?? null,
      draft: saved.outreach?.draft ?? null,
      company: saved,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Buyer research failed." }, { status: 500 });
  }
}
