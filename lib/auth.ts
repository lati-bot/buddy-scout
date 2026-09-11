// Minimal shared-password auth. Anyone with SCOUT_PASSWORD gets a signed
// cookie; the middleware/routes check it. Upgrade to Clerk (per-user accounts)
// later without touching the engine. No external deps -- HMAC via node:crypto.

import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

const COOKIE = "scout_session";

function secret(): string {
  return process.env.SCOUT_SESSION_SECRET || "dev-insecure-secret-change-me";
}

export function makeToken(): string {
  // Token payload is just a fixed marker + timestamp; value is the HMAC.
  const payload = `ok.${Date.now()}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", secret())
    .update(payload)
    .digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function passwordOk(input: string): boolean {
  const expected = process.env.SCOUT_PASSWORD || "";
  if (!expected) return false;
  const a = Buffer.from(input || "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const COOKIE_NAME = COOKIE;

export function isAuthed(req: NextRequest): boolean {
  return verifyToken(req.cookies.get(COOKIE)?.value);
}
