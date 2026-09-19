type WebHit = { url: string; title: string; description?: string };
type WebSearch = (q: string) => Promise<WebHit[]>;
type PageFetcher = (url: string) => Promise<{ url: string; text: string } | null>;

async function braveSearch(q: string) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8`,
      { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(8000) }
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

export const publicWebSearch: WebSearch = async (q) => {
  const brave = await braveSearch(q);
  if (brave?.length) return brave;
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
};

export const publicPageFetcher: PageFetcher = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BuddyScout/0.1 (+B2B prospecting)" },
      signal: AbortSignal.timeout(9000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
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
};
