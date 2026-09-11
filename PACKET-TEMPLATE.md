# Buddy Scout — Packet Template (v1 spec)

> A packet is a **sales weapon**, not a research report. Every section answers: *"What does Jolene do with this to WIN this deal?"*
> If a line doesn't help her close, it doesn't belong.

---

## 0. Header — the snapshot
- **Company:** name + `domain` (the ID)
- **Status:** 🆕 new / 👀 watching / 🔥 hiring-now / ✅ contacted / 💰 closed
- **Last checked:** date (and "hiring signal seen: <date/source>")
- **Confidence:** High / Medium / Thin — how solid is this packet's data (be honest so she can gut-check)

## 1. Who they are (10-second read)
- One sentence: what the company does.
- Stage (seed / A / B / C), rough size, location.
- **Why they're a fit for Buddy** in one line (they're a software startup hiring engineers = our exact target).

## 2. The hiring signal — WHY we care right now
- **Are they hiring? What roles?** (the trigger — with the source link: careers page / LinkedIn post / job board)
- **How hot:** "posted 3 eng roles this week" vs "one stale listing." Urgency = close speed.
- Any pain signal: scaling fast, just raised, founder posted "we're hiring like crazy."

## 3. The way in — WHO + is it warm?
- **Right person to reach:** name, title, why them (founder for early, Head of Talent if they have one).
- **Contact:** verified email (+ how confident).
- **⭐ Warm path:** is anyone on the Dev Difference team connected to them / their company / their school-org network? If yes → **lead with this, it's the highest-close-rate move.** If no → say "cold, no known connection."

## 4. The strategy — how Jolene WINS this one (the real value)
- **The angle:** the ONE thing to hit them with, specific to *this* company. Not "we help you hire" — "you just posted 3 backend roles and you're 8 people; Buddy is the resume-screen layer so your founders stop doing first-round calls."
- **Their likely objection + the counter:** (e.g. "they'll ask about ATS integration → we integrate with X").
- **Warm vs cold play:** if warm, "ask <person> for the intro." If cold, "go direct to founder, keep it 3 sentences."

## 5. The draft message (ammo, editable)
- A short, personalized outreach message she can copy, tweak, send.
- References something real about *them* (from §1–2) so it never reads generic.
- **Sources cited** for the personalization line, so she trusts it before hitting send.

---

## Notes on build behavior
- **Fast pass:** fill §0–1, §3 email, a decent §5 from quick scrape (~30s).
- **Deep pass (on request or auto for hot):** enrich §2 hiring detail, §4 strategy, warm-path check. Agent says "digging, back in a few min."
- **DB keyed on `domain`.** Every packet request first checks: do we already have this company? Merge, don't duplicate.
- **Honesty rule:** thin data → labeled Thin, never fabricated. Show sources.
