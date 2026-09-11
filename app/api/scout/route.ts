import { NextRequest, NextResponse } from "next/server";
import { scout } from "@/lib/engine";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Not signed in." },
      { status: 401 }
    );
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Bad request." },
      { status: 400 }
    );
  }
  const result = await scout({
    company: body?.company || "",
    domain: body?.domain || "",
    contactName: body?.contactName || "",
    contactTitle: body?.contactTitle || "",
  });
  return NextResponse.json(result);
}
