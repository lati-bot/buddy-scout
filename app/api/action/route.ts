import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { recordOutreachAction } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["sent", "skipped", "replied", "meeting", "restored"]);

// Records Jolene's decision. This endpoint never sends outreach.
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const domain = String(body?.domain ?? "").trim();
    const action = String(body?.action ?? "").trim();
    const note = body?.note == null ? null : String(body.note);
    if (!domain || !ACTIONS.has(action)) {
      return NextResponse.json({ ok: false, error: "Pass a company and valid action." }, { status: 400 });
    }
    const company = await recordOutreachAction(
      domain,
      action as "sent" | "skipped" | "replied" | "meeting" | "restored",
      note
    );
    return NextResponse.json({ ok: true, company });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Could not save action." }, { status: 500 });
  }
}
