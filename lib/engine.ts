// Buddy Scout engine -- ported from the Python agent (emailfind.py).
// Finds the verified business email for an identified buyer, with a provider
// waterfall (Prospeo -> Hunter) so a single provider running dry doesn't stall.
// Never throws into the route: every failure returns a structured result.

export type ScoutResult = {
  ok: boolean;
  error?: string;
  company?: string;
  domain?: string;
  contactName?: string;
  contactTitle?: string;
  email?: string | null;
  emailStatus?: string;
  verification?: string | null;
  source?: string | null;
  reason?: string | null;
  found?: boolean;
  angleLabel?: string;
  angleBody?: string;
  channel?: string;
};

const FOUNDER_TITLES = [
  "ceo",
  "co-founder",
  "cofounder",
  "founder",
  "owner",
  "president",
];

const ANGLES = {
  founder: {
    label: "Founder time-saver",
    body:
      "No talent team yet, so the founder is screening applicants personally. " +
      "Buddy pre-filters and ranks them, then hands over a shortlist. " +
      "You're selling time back.",
  },
  team: {
    label: "Recruiter support",
    body:
      "They have a talent team, so Buddy augments rather than replaces: it feeds " +
      "pre-vetted, ranked candidates so recruiters skip the top-of-funnel " +
      "sourcing grind.",
  },
};

export function cleanDomain(raw: string): string {
  let d = (raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0];
  d = d.replace(/^www\./, "");
  return d;
}

function inferAngle(title: string): "founder" | "team" {
  const t = (title || "").toLowerCase();
  return FOUNDER_TITLES.some((w) => t.includes(w)) ? "founder" : "team";
}

type ProviderResult = {
  email: string | null;
  status: string;
  source: string;
  verification?: string | null;
  reason?: string | null;
};

// --- Prospeo (primary) ---------------------------------------------------
async function findViaProspeo(
  fullName: string,
  domain: string,
  companyName: string
): Promise<ProviderResult> {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) {
    return {
      email: null,
      status: "no_key",
      source: "prospeo",
      reason: "PROSPEO_API_KEY missing from environment",
    };
  }
  const data: Record<string, string> = { full_name: fullName };
  if (domain) data.company_domain = domain;
  if (companyName) data.company_name = companyName;

  let resp: Response;
  try {
    resp = await fetch("https://api.prospeo.io/enrich-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": key },
      body: JSON.stringify({ data, only_verified_email: true }),
    });
  } catch (e) {
    return {
      email: null,
      status: "error",
      source: "prospeo",
      reason: String(e).slice(0, 140),
    };
  }

  if (!resp.ok) {
    // Prospeo returns HTTP 400 with error_code NO_MATCH for a valid lookup
    // that simply has no matching person -- that's a miss, not an outage.
    let code = "";
    try {
      const err = await resp.json();
      code = err?.error_code || "";
    } catch {
      /* ignore */
    }
    if (code === "NO_MATCH") {
      return {
        email: null,
        status: "no_match",
        source: "prospeo",
        reason: "No verified record for this person yet",
      };
    }
    if (resp.status === 429) {
      return {
        email: null,
        status: "rate_limited",
        source: "prospeo",
        reason: "Prospeo rate limit reached; try again shortly",
      };
    }
    return {
      email: null,
      status: `http_${resp.status}`,
      source: "prospeo",
      reason: `Prospeo HTTP ${resp.status}${code ? ` (${code})` : ""}`,
    };
  }

  let body: any;
  try {
    body = await resp.json();
  } catch {
    return {
      email: null,
      status: "error",
      source: "prospeo",
      reason: "Prospeo returned an unreadable response",
    };
  }
  if (body?.error) {
    const code = body?.error_code || "";
    if (code === "NO_MATCH") {
      return {
        email: null,
        status: "no_match",
        source: "prospeo",
        reason: "No verified record for this person yet",
      };
    }
    return {
      email: null,
      status: "api_error",
      source: "prospeo",
      reason: String(code || "Prospeo error").slice(0, 140),
    };
  }

  const em = body?.response?.email || body?.person?.email || {};
  const email = em?.email || null;
  if (!email) {
    return {
      email: null,
      status: "not_found",
      source: "prospeo",
      reason: "Prospeo returned no email for this lead",
    };
  }
  return {
    email,
    status: "found",
    source: "prospeo",
    verification: em?.status || "VERIFIED",
  };
}

// --- Hunter (fallback, only if HUNTER_API_KEY present) -------------------
async function findViaHunter(
  fullName: string,
  domain: string
): Promise<ProviderResult> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    return { email: null, status: "no_key", source: "hunter" };
  }
  const [first, ...rest] = fullName.trim().split(/\s+/);
  const last = rest.join(" ");
  const url =
    `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}` +
    `&first_name=${encodeURIComponent(first)}` +
    `&last_name=${encodeURIComponent(last)}&api_key=${encodeURIComponent(key)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return {
        email: null,
        status: `http_${resp.status}`,
        source: "hunter",
        reason: `Hunter HTTP ${resp.status}`,
      };
    }
    const body = await resp.json();
    const email = body?.data?.email || null;
    if (!email) {
      return {
        email: null,
        status: "not_found",
        source: "hunter",
        reason: "Hunter returned no email",
      };
    }
    return {
      email,
      status: "found",
      source: "hunter",
      verification: body?.data?.verification?.status || "unknown",
    };
  } catch (e) {
    return {
      email: null,
      status: "error",
      source: "hunter",
      reason: String(e).slice(0, 140),
    };
  }
}

const WATERFALL = [findViaProspeo, findViaHunter];

async function findEmail(
  fullName: string,
  domain: string,
  companyName: string
): Promise<ProviderResult> {
  const misses: ProviderResult[] = [];
  for (const finder of WATERFALL) {
    let res: ProviderResult;
    try {
      res = await finder(fullName, domain, companyName);
    } catch (e) {
      res = {
        email: null,
        status: "error",
        source: finder.name,
        reason: String(e).slice(0, 140),
      };
    }
    if (res.email) return res;
    misses.push(res);
  }
  for (const m of misses) {
    if (m.status !== "no_key") return m;
  }
  return misses[0] || { email: null, status: "no_providers", source: "none" };
}

export async function scout(input: {
  company: string;
  domain: string;
  contactName: string;
  contactTitle: string;
}): Promise<ScoutResult> {
  const company = (input.company || "").trim();
  const domain = cleanDomain(input.domain);
  const contactName = (input.contactName || "").trim();
  const contactTitle = (input.contactTitle || "").trim();

  if (!company || !domain) {
    return { ok: false, error: "Need a company name and a website (domain)." };
  }
  if (!contactName) {
    return {
      ok: false,
      error:
        "Need a contact name to verify. Tip: the founder/CEO for small " +
        "startups, or Head of Talent for bigger ones.",
    };
  }

  const res = await findEmail(contactName, domain, company);
  const angleKey = inferAngle(contactTitle);
  const angle = ANGLES[angleKey];
  const email = res.email;

  return {
    ok: true,
    company,
    domain,
    contactName,
    contactTitle: contactTitle || "(title not given)",
    email,
    emailStatus: res.status,
    verification: res.verification ?? null,
    source: res.source ?? null,
    reason: res.reason ?? null,
    found: Boolean(email),
    angleLabel: angle.label,
    angleBody: angle.body,
    channel: email
      ? "Verified email + LinkedIn"
      : "LinkedIn first; email fallback pending",
  };
}
