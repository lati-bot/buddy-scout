import companies from "@/data/nyc.json";
import Portal from "./portal";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import Login from "./login";

export const dynamic = "force-dynamic";

export default function Home() {
  const authed = verifyToken(cookies().get(COOKIE_NAME)?.value);
  if (!authed) return <Login />;
  const seed = (companies as any[]).map((c) => ({ company: c.company, domain: c.domain }));
  return <Portal seed={seed} />;
}
