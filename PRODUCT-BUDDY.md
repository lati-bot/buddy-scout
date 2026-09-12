# PRODUCT-BUDDY.md — What Dev Difference / Buddy Actually Is

> Captured 2026-09-12 with Tomi. Purpose: a clear, shared understanding of the
> product Jolene is selling, so it grounds how we build the **Scout sales agent**.
> Whenever a build/design question feels ambiguous, re-read this and think like a
> founder who owns this product and needs to sell it.

---

## The startup
**Dev Difference.** Jolene leads sales.

## The product
**Buddy** — an **AI recruiter that interviews every applicant** so the person
hiring doesn't have to. Think of it as **AI-world ATS**: keyword ATS filters
people *out*; Buddy filters people *in* — it actually talks to candidates and
surfaces who's worth the founder's time, including strong people a human screen
would never have reached.

## Who it's for
- **Startup founders** hiring for any roles (PMs, devs, whatever) — time-starved,
  every dollar precious, can't afford a bad hire OR wasted hours.
- **Also established company recruiting teams** — same core pain at scale.

---

## The core pain (think like the founder)
- I have (or soon will have) a bunch of roles to fill.
- I *want* to talk to talent before hiring — every dollar matters, can't waste a hire.
- But I **can't** talk to 1,000 applicants. I talk to ~10, hire one that's "good
  enough" — while maybe 100 better people sat unseen in that list.
- In today's world **everyone uses AI to make a perfect resume for any role**, so
  resumes are noise. I can't tell signal from tailored fluff.
- I don't want to waste time on people who are clearly not a fit — at minimum,
  screen those out.

## What Buddy does
- Buddy is not human — it **has time to interview all 10,000 applicants.**
- For each open role, Buddy already has: **the resume + the job listing details**,
  and **optionally** founder-supplied notes ("test for X", "I specifically want Y").
- Anyone who applies gets a link to **interview with Buddy** (immediately or whenever,
  within some window).
- Buddy screens them through a real conversation, then reports back to the
  founder/recruiter with a **rating + details on the person + their resume**, etc.
- Result: filters out noise AND surfaces good talent the founder might never have
  spoken to on their own. The founder still has full access to everything; Buddy
  comes in with "hey, these are folks you may want to talk to."

---

## Two corrections Tomi made (IMPORTANT — don't drift back)

### 1. It's about the ROLE, not the resume claim
- Do NOT over-index on "can the person talk to what they claim on the resume."
- **Primary signal = fit for the ROLE** (and for what the founder said they're
  looking for). Buddy tests for **what the role actually needs.**
- The resume is **important but secondary**: it tells Buddy what to probe and lets
  Buddy learn more about the person. Buddy may not even strictly need the resume —
  it can test for role requirements directly.

### 2. Buddy works as a STREAM, not a batch
- NOT "wait for all applicants, then hand over a final ranked list."
- **As each person applies and does their Buddy interview, Buddy immediately
  processes them and adds an update** with a verdict on that candidate.
- Focus is **categorization** (e.g. *extreme fit → … → not a fit*), possibly more
  than pure ranking. Exact buckets = an open DESIGN question.
- The founder always has a **live, continuously-updating, sorted picture** — not a
  one-time report. NOT framed as "here's who you'd have missed" — framed as an
  ongoing sorted view of who's worth their time.

---

## The reframe / positioning
- Not "resume screening." It's **"talk to everyone, surface who's worth your time,
  sorted, live."**
- The value isn't the founder talking to Buddy. The value is a **seamless, deeply
  helpful experience** that slots into their existing hiring with near-zero effort.

---

## OPEN DESIGN QUESTIONS (PARKED — design later, with the DD team + hands-on Buddy)
> Tomi wants to actually use Buddy as a founder first, then design with the team.
> We can bring our own opinions, but not decide product requirements blind.
> **Do NOT design or build Buddy now. This is context for the Scout sales agent.**

1. **Entry point** — where does the founder first meet Buddy? Paste a job link and
   it self-configures? Or does Buddy live on top of where applications already land
   (existing job post / inbox / ATS)? (Tomi & Lati both have the same question →
   needs hands-on.)
2. **Applicant's door** — how does an applicant reach Buddy? Auto-email link?
   Embedded in the application? Fully hands-off for the founder after setup?
3. **Handoff back** — how does the founder receive Buddy's verdicts? Live-updating
   shortlist? Digest? "N people worth your time" nudge? (This is where the "relief"
   feeling is won or lost.)
4. **Trust gap (critical)** — what if Buddy misses good talent? How does the founder
   trust Buddy ran a *good* interview and filtered correctly? How do we *demonstrate*
   that trust? (Transparency / show-your-work / spot-check — TBD.)

### Lati's instincts (opinions only, not decisions)
- The magic is in **entry point (#1)** and **handoff (#3)**. If onboarding is near
  "paste your job link, done," and the payoff is opening your inbox to a live,
  sorted view of who's worth your time — Buddy wins. The interview tech is table stakes;
  the **taste** is at those two edges.
- Trust (#4) likely needs **show-your-work**: for each verdict, Buddy shows *why*
  (against role requirements), so the founder can spot-check and build confidence.

---

## Why this doc exists
This grounds the **Scout sales agent** work. When a Scout build/design question is
ambiguous, imagine being a founder who owns Buddy and needs to sell it — this doc is
that founder's brain. Use it to reason about the *right* move, not the cool move.
