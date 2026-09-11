import companies from "@/data/nyc.json";
import Scout from "./scout";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import Login from "./login";

export const dynamic = "force-dynamic";

export default function Home() {
  const authed = verifyToken(cookies().get(COOKIE_NAME)?.value);
  if (!authed) return <Login />;
  return <Scout seed={companies as any[]} />;
}
