# Buddy Scout — The Real Design (first principles, excellence bar)

> Written after Tomi pushed: stop building "so it runs end-to-end." Start from *what
> are we actually trying to do*, *what does an ideal solution look like*, then work
> backward to *what we must have*, then *how we build it*. Every stage: deep, not shallow.

---

## 0. What are we actually trying to do?

Dev Difference sells **Buddy** (AI resume-screening) to **software startups that are hiring**.
Jolene is the rep. Her job has four layers (from the client call, in order of hardness/value):

1. **Find** startups worth pitching — *she says this is NOT the hard part.*
2. **Confirm they're hiring** — medium.
3. **Find the entry point** (right person + is it warm) — HARD + valuable.
4. **Craft the personalized pitch** — HARDEST + most rewarding. Rex's "magic wand."

The prize is **3 + 4**. But 3+4 are only trustworthy if **1+2 are excellent and factual.**
A perfect pitch built on a wrong fact is worse than nothing — it burns Jolene's credibility.

**So the real job of Buddy Scout:** *manufacture trust.* Give Jolene, per company, a packet
where every claim is sourced, every role is real, the angle is sharp, and the draft is
sendable — so she spends her time closing, not researching or fact-checking us.

---

## 1. What does the IDEAL solution look like? (before any "how")

Jolene's ideal experience, end to end:

- She almost never has to *find* companies herself — Buddy Scout maintains a **living queue**
  of funded software startups, each already confirmed hiring, freshness-dated.
- She can also **drop in any company** (name or URL) and get the same quality on demand.
- For any company she gets a **packet** where:
  - the hiring signal is **real and current** (pulled from the company's own ATS, not guessed),
  - every fact carries a **source** she can click,
  - the pitch angle is **specific to them** and obviously right,
  - the draft is **sendable after light edits**, never generic, never auto-sent,
  - anything we're unsure of is **labeled unsure** — the tool never bluffs.
- The whole thing **runs itself** — collects, re-checks, and re-ranks without a human.

The single north-star property: **zero unsourced claims.** If Buddy Scout says it, Jolene can
trust it or see exactly why it's flagged soft. That is the entire moat. Everything below serves it.

---

## 2. Stage-by-stage: what must be TRUE for each to be excellent

Working the pipeline as a chain. Each stage has a **bar** (what "excellent" means) and the
**inputs it must have** to hit that bar. This is the "what we must get" list.

### Stage A — FIND companies (Layer 1)
- **Bar:** a broad, deduped, continuously-refreshed pool of *software startups* that fit ICP
  (funded, small-enough that hiring = pain, tech roles present). Not a static CSV.
- **Must have:**
  - **Seed sources** (multiple, so we're not hostage to one): curated hiring newsletters
    (Jolene's BackedNYC-style lists), YC/funding announcements, and — the big unlock from
    research — **the ATS universe itself**. Greenhouse/Lever/Ashby/etc. public boards ARE a
    directory of companies that are hiring right now. We can discover companies *from* the
    signal, not just check companies we already had.
  - A canonical **domain** per company (the dedupe key — already built: `normalizeDomain`).
- **Excellence detail:** treat "find" as *ongoing ingestion*, not a one-time import. New funding
  round → candidate. New board appears → candidate. This is where breadth comes from.

### Stage B — CONFIRM hiring + extract roles (Layer 2) ← the factual bedrock
- **Bar:** for any company, know **truthfully**: are they hiring, which exact roles, since when,
  are any sales/GTM-relevant — with a **source URL**. 0 false negatives, 0 invented roles.
- **Must have:**
  - **ATS auto-detection from a domain**, then hit the right **public JSON API**. Research
    confirms the whole industry does this — no HTML scraping needed for the ~80% on major ATSs:
    - Greenhouse: `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (one call, all
      roles; **content is HTML-escaped — must html-unescape**; best dept taxonomy).
    - Lever: `api.lever.co/v0/postings/{company}?mode=json` (flat array; `createdAt` = epoch ms;
      unknown slug = real 404; `workplaceType` field is gold for remote/hybrid).
    - Ashby: `api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` (**salary
      data!** min/max/currency — nest under `summaryComponents` OR `compensationTiers[].components`,
      parse both). Common among well-funded startups.
    - SmartRecruiters: paginates (limit/offset); **wrong company = HTTP 200 totalFound:0, NOT 404**
      — must require `totalFound>0` before believing detection; descriptions need per-posting call.
    - Recruitee: `{company}.recruitee.com/api/offers/` (subdomain; wrong slug = DNS error not HTTP;
      dates non-ISO; employment types are composite codes needing a normalization table).
    - (Workday, Workable too — add as reach.)
  - **ATS discovery**: given a domain with no known board, find its ATS. Probe common patterns +
    read the company's /careers page for outbound links to `*.greenhouse.io`, `jobs.ashbyhq.com`,
    `jobs.lever.co`, etc. This closes the "Rogo" gap (self-hosted careers → find the real board).
  - **Headless render fallback** only for the genuine minority with no public API.
  - **A normalization layer** — the research's punchline: *"the real cost isn't fetching, it's
    normalizing."* Five APIs, five schemas, five date formats. We need ONE internal `Role` shape
    {title, dept, location, workplaceType, url, postedAt, salary?} that everything maps into.
- **Excellence detail:** "hiring since when" + role counts over time = **freshness & heat**. Three
  eng roles posted this week ≫ one stale listing. That temporal signal is what makes Stage D sharp.

### Stage C — ENTRY POINT: who + is it warm (Layer 3)
- **Bar:** the right person to contact (founder for tiny, Head of Talent if they have one), a
  **verified** email (with confidence), and — highest value — **is anyone on the Dev Difference
  team already connected to them?**
- **Must have:**
  - Person resolution (founders from YC/site — already have `founders.py`; talent-lead detection).
  - Email: **Prospeo** free tier already wired + proven (13/20 verified on the NYC run), with the
    verification *status* carried through so we never present a guessed email as solid.
  - **Warm-path matcher**: team LinkedIn Connections.csv × company → "you already know someone
    here." This is the single highest-close-rate signal per the client call. Pending Tomi's export.
- **Excellence detail:** warm > cold, always lead with warm. If cold, say so plainly.

### Stage D — THE PITCH: strategy + draft (Layer 4) ← the magic wand
- **Bar:** an angle so specific the company thinks "why aren't we already buying this?" + a
  sendable draft. **Every specific claim traceable to a Stage A–C fact.** Zero invention.
- **Must have:**
  - A **facts bundle with provenance** assembled from A–C (this is the thing Sol/Luna writes FROM).
    The model's job is *composition*, not *knowledge*. If a fact isn't in the bundle, it can't
    appear in the draft. This is how we kill the "Solana" hallucination structurally, not by hoping.
  - A tight brief of **what Buddy sells** + common objections/counters (static, curated once).
  - The right **writer model** — decided by the Luna-vs-Sol A/B, not by default. Likely: cheap
    model writes, smart model reserved (if at all) for the strategic-angle reasoning on hot leads.
- **Excellence detail:** the draft references something *real and specific* (a role they posted
  this week, their stage) — and cites it. Sendability = did-a-human-write-this test.

### Stage E — THE LOOP: make it an agent, not a script
- **Bar:** runs unattended. Collects new companies, re-checks hiring on a cadence, re-ranks the
  queue by heat, flips watched→hot when a company starts hiring, notifies.
- **Must have:** a scheduler (Vercel Cron), the Cosmos store (built), status state machine
  (new→watching→hiring→contacted), and a recheck policy (hot = often, cold = rarely — save spend).

---

## 3. NOW the "how" — architecture that falls out of the above

```
                 ┌─────────────── SEED SOURCES ───────────────┐
                 │ newsletters · funding feeds · ATS universe │
                 └───────────────────┬────────────────────────┘
                                     ▼
   [A] Ingest ─► normalizeDomain ─► dedupe (Cosmos, built) ─► company record
                                     ▼
   [B] ATS-detect ─► public JSON API (GH/Lever/Ashby/SR/Recruitee) ─┐
        │  fallback: careers-link discovery ─► headless render      │
        ▼                                                            ▼
     NORMALIZE → one internal Role[] shape ──────────────► hiring verdict + heat
                                     ▼                        (Luna classifies/labels)
   [C] Entry point: founders/talent + Prospeo email + warm-path (LinkedIn CSV)
                                     ▼
   [D] Facts bundle WITH SOURCES ─► writer model ─► packet (angle + draft, all cited)
                                     ▼
   [E] Cron loop: recheck heat, re-rank queue, flip status, notify Jolene
                                     ▼
                        Black-&-white portal: queue + on-demand + confirm panel
```

**The one principle that governs every arrow:** a fact may only flow downstream **with its
source attached.** The writer at [D] can physically only see sourced facts. Provenance is not
a feature bolted on — it's the type system of the pipeline.

---

## 4. What we must GET (the shopping list, prioritized)

1. **Multi-ATS fetch + normalization layer** (GH, Lever, Ashby, SmartRecruiters, Recruitee) with
   one internal `Role` schema + all the documented quirks handled. ← biggest single lever, do first.
2. **ATS auto-detection from a domain** + careers-link discovery (closes Rogo gap).
3. **Facts-bundle-with-provenance** data structure — the contract between research and writing.
4. **Writer decision** via Luna-vs-Sol A/B (cheap default likely).
5. **Seed ingestion** beyond newsletters (funding feed; later: harvest companies from ATS boards).
6. **Warm-path matcher** (needs Tomi's LinkedIn Connections.csv — pending).
7. **Cron loop + heat/recheck policy.**
8. Portal (black & white) — queue + on-demand + confirm panel. Functionality first.

---

## 5. What we deliberately are NOT doing (so we stay excellent, not sprawling)
- Not scraping HTML where a public API exists (research is explicit: don't).
- Not researching "the whole world" — ICP is narrow (funded software startups hiring tech roles).
  Depth on the right companies beats breadth on wrong ones. (Client learned volume fails.)
- Not auto-sending anything. Draft → Jolene.
- Not paying for aggregators yet — the public ATS APIs are free and are what the paid tools resell.
- Not over-modeling: smart tier only where an A/B proves it earns its cost.

---

## 6. Definition of excellent (how we'll know we didn't just "make it run")
- Pick 20 real companies. For each, a human can verify: hiring status correct, every role real,
  every packet claim traceable to a source, draft sendable. **Target: 20/20 on truth, 0 invented facts.**
- If any claim can't be sourced, that's a bug, not a rough edge.
