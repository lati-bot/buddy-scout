import { NextRequest } from "next/server";

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on scheduled invocations.
// We gate the cron routes on it so nobody can trigger a research/spend loop by
// hitting the public URL. If CRON_SECRET is unset we FAIL CLOSED (deny) rather
// than run open — a missing secret must never mean "anyone can run this."
export function cronAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}
