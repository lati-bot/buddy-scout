# Buddy Scout — Build Plan (v1 → agent)

## NAMING (do not drift)
- The product is **Buddy Scout**. Always use the full name.
- "Buddy" alone is **Dev Difference's real product** — different thing. Scout is the prospecting tool.
- Never shorten "Buddy Scout" to "Buddy" in UI, docs, or packets.

## UI DIRECTION (Tomi, Sep 11)
- **Functionality is the priority right now**, not polish. But keep UI clean from the start.
- **Black & white, simple, editorial.** No gradients (esp. no purple/indigo), no Inter font,
  no card grids, no emoji-as-section-icons, no AI-slop look. Real typography + hierarchy.
- Follows the anti-AI rules already in HEARTBEAT.md. Looks like a deliberate product, not a template.
- Logo: Tomi has Foundry image models available if we want a generated mark; otherwise keep it typographic.

### Image model (for logo later)
- Deployment name: `gpt-image-2` (model `gpt-image-2`, version `2026-04-21`, GA).
- Endpoint: `https://myclawdproject-resource.services.ai.azure.com/openai/v1/images/generations`
- Same resource + API key as the chat models (already in `.env.local`). Rate limit: 2 req/min.
- Not used yet — logo is typographic for now; generate a mark only when we decide to.

## ASYNC PACKET PATTERN (new company = takes time)
- Cache hit (company already in DB) → show instantly.
- New company → research takes real time (fetch + Luna + Sol). Don't block Jolene on a spinner.
  Tell her *"New to us — digging in, ~a minute. I'll notify you when the packet's ready,"*
  let her move on, and notify/ping when done. Async, not a frozen wait.

## Architecture (Azure-native)
- **Cosmos DB** — the startup database. Partition key: `domain` (the unique ID). One document per company.
- **Azure OpenAI** — two deployments ideally:
  - a **cheap/fast** model (gpt-4o-mini or similar) → bulk collection, hiring classification, first-pass packet
  - a **strong** model (gpt-4o / gpt-4.1) → deep packet: strategy + personalized draft
- **Next.js app (Vercel)** — Jolene's UI: on-demand packet request + queue of hot companies.
- **Scheduled worker** — the "always working" loop. Runs collection + bi-weekly hiring re-check. (Vercel Cron, or Azure Function on a timer — decide below.)

## Cosmos document shape (per company)
```
{
  domain, name, stage, size, location, description,
  status: "new|watching|hiring|contacted|closed",
  hiring: { isHiring, roles[], source, seenAt },
  contact: { person, title, email, confidence },
  warmPath: { connected, who, via } | null,
  packet: { fast{}, deep{}, generatedAt },
  lastCheckedAt, createdAt, sources[]
}
```

## Build phases
**Phase 1 — Skeleton machine (no waiting on data)**
- Cosmos connection + company CRUD, domain-keyed dedupe.
- On-demand packet endpoint: fast pass (~30s) writes §0–3 + email + draft.
- UI: paste domain → packet renders; "dig deeper" → deep pass.
- Seed DB with ~100 US startups.

**Phase 2 — Intelligence (Azure OpenAI wired)**
- §5 strategy + §6 personalized draft via strong model.
- Company research: scrape site/careers page, feed model.
- Hiring classifier (cheap model): is this company hiring? which roles?

**Phase 3 — The agent loop (always working)**
- Scheduled collector: pull new startups into DB continuously.
- Bi-weekly re-check: flip companies to "hiring" → auto-generate packets → surface in Jolene's queue.

**Phase 4 — Warm path**
- Ingest Dev Difference team's LinkedIn/contacts export.
- Match against hot companies → ⭐ warm-path in packet.

## WHAT I NEED FROM TOMI (to start Phase 1–2)
1. **Cosmos DB:** connection string (or endpoint + key), and a database + container name I can use (or make one: db `buddyscout`, container `companies`, partition `/domain`).
2. **Azure OpenAI:** endpoint URL, API key, and the **deployment name(s)** you've stood up (tell me which model each is). If you can deploy: one cheap (gpt-4o-mini) + one strong (gpt-4o).
3. **API version** for Azure OpenAI (e.g. `2024-08-01-preview`) — whatever your resource supports.
4. Later (Phase 4): the team's LinkedIn/contacts export (CSV).

## Decision needed
- **Scheduler home:** Vercel Cron (simplest, lives with the app) vs Azure Function (more control, closer to your data). Lean Vercel Cron for v1.

## ON-DEMAND FLOW (Jolene brings a company) — v1 core

Jolene won't only browse the auto-queue; she'll often show up *with* a company (a name she
heard, or a URL). This is a first-class v1 path, not an afterthought.

**The flow:**
1. Jolene enters a **company name OR a URL** in a side panel.
2. Buddy **resolves to a domain**: URL → `normalizeDomain()`; name → web lookup to find the site.
3. **"Do we already have this?" check** — Cosmos lookup by domain (dedupe we already built):
   - Already covered → show existing status + hiring signal + packet (don't redo work / waste a Sol call).
   - New → create record, research fresh.
4. Research: fetch careers → Luna classifies hiring → Sol builds packet.
5. Packet renders in the panel.

**Conversational confirm panel (v1.1 — same phase, nicer front door):**
Company names are ambiguous ("Rain" = several companies). So the panel is chat-style:
- Jolene types a name → Buddy (Luna + a quick web lookup) **confirms which company** before spending
  a research/packet cycle: *"Rain, the crypto payments infra co at rain.xyz — that one?"*
- On confirm → dedupe check → research or show existing.
- The confirm step prevents researching the wrong company and wasting a Sol call.

**Sequencing:** build the pipeline first (name/URL → dedupe → packet), then wrap the conversational
UI around it. No new infrastructure — reuses `normalizeDomain`, the repo dedupe, Luna, and Sol.

## ACCEPTANCE CRITERIA (definition of done for Jolene)

**The core promise:** Jolene opens Buddy Scout, sees a queue of funded startups that are
*actually hiring right now*, and for any one she can get a ready-to-review outreach packet —
without doing the research herself.

### v1 is DONE when:

**1. Data is trustworthy**
- [ ] Hiring classifier is correct on a 20-company eval: **0 false "not hiring"** on companies
      that are actually hiring, **0 hallucinated roles** (only roles on the page). Thin/blocked
      pages honestly reported as `thin`, never guessed.
- [ ] Fetch layer reliably pulls roles from the common job boards (Ashby, Greenhouse) via their
      APIs, not brittle HTML scraping. Company-hosted pages fall back to a render.
- [ ] No duplicate companies in the DB (domain-keyed dedupe holds).

**2. The packet is useful**
- [ ] For a hot company, Buddy produces a packet with: company snapshot, why-now hiring signal,
      the sales angle (what Dev Difference sells them), a named/likely contact, and a
      **personalized outreach draft Jolene can edit and send** — never auto-sent.
- [ ] Packet reads like a person wrote it, not AI filler. Jolene would actually send the draft
      after light edits, not rewrite it from scratch.
- [ ] Fast pass returns in ~30s; deep pass is opt-in.

**3. The agent works on its own**
- [ ] Scheduled loop runs without a human: collects new startups + re-checks hiring bi-weekly.
- [ ] When a watched company starts hiring, it flips to the queue automatically.

**4. It's safe and stays in budget**
- [ ] Login-gated; no secrets in repo/browser; scraping respects robots.txt + rate limits.
- [ ] Monthly Azure LLM + Cosmos spend stays under $50 (budget alert set).

### Explicitly OUT of v1 scope
- Auto-sending any email (always a draft for Jolene).
- Per-user auth (single shared password until >1 user).
- Warm-path matching (Phase 4 — needs the team's contacts export).

### How we verify
Each phase ends with an eval script run against **real companies** (like the 5 from Jolene's
newsletter), results reviewed with Tomi before wiring into the automatic loop. No shipping blind.

## Secrets handling
- All keys go in Vercel env vars (server-side only), never in the repo or browser.
- Do NOT paste keys in Telegram chat — I'll give you the exact Vercel env-var names to fill in yourself, OR you drop them in a local file I read once and delete.
