# Buddy Scout — Changelog

A running, human-readable log of what's built, changed, and fixed. Newest first.
Reference this to see what's new, what was added, and why.

**Security note:** No secrets in this file — ever. No API keys, tokens, passwords,
env values, or credentials. Describe *that* a key/integration exists, never the value.

---

## 2026-09-12 — Buyer-naming goes live (Brave), URL-first front door, packet polish

### Added
- **Web search integration** — the app can now search the public web to name buyers.
  Provider: Brave Search API (free tier). Key lives in Vercel env only (not in code/repo).
  Falls back to DuckDuckGo scrape if the key is absent. Wired into both the scout
  (name→domain resolution) and buyer (people-naming) routes.
- **URL-first front door** — the lookup box now asks for the company's website directly
  instead of guessing from a name. Rationale: the user knows the URL, so we don't waste
  a search query resolving it. Search budget is reserved for buyer-naming (the thing only
  search can do). Typing a name still works as a fallback.
- **Candidate picker escape hatch** — when a name resolves to the wrong/uncertain domain,
  the picker now shows "None of these? Type the exact website" so the user can override.

### Changed
- **Resolver prefers full-name domains over first-word.** Previously "dev difference"
  collapsed to "dev" and matched dev.ai. Now full-name variants (devdifference.com/.io,
  hyphenated) are tried first; first-word is the weakest/last guess. Multi-word names that
  only match on the first word fall through to search rather than committing.

### Fixed
- **Inline `[f#]` citation markers removed from prose.** The writer model embedded tokens
  like `[f13][f14]` inside sentences. `stripFactMarkers()` now cleans all reader-facing
  fields (who-they-are, hiring signal, way-in, draft, strategy). Citations render only in
  the "Backed by" footer. Note: only applies to *freshly generated* packets; old cached
  ones keep the old text until re-scouted.

### Verified live
- Buyer-naming went from 0/4 (empty) to 4/4 confirmed with real names, titles, and cities:
  Linear, Vercel, Ramp, Retool — plus Harvey (2/2, founders + SF). Real sources attached.

### Known issues / next (see memory punch-list for detail)
- "Who they are" reads thin (homepage tagline, not insight) — candidate for one targeted
  recency-fact search to sharpen it + the pitch.
- Buyer-reason text can reference the wrong role type (said "engineering" when signal was
  sales/GTM) — should mirror the actually-detected role mix.
- Same person can appear twice (e.g. CEO + Founder rows); duplicate source lines — needs dedup.
- Companies with no public ATS (e.g. thedevdifference.com) return a blank packet. Open
  question: should we still name buyers + explain "no public job board" instead of bowing out?
- Warm-path intros currently reflect the owner's network only; per-owner network CSV not
  yet loaded.

## 2026-09-12 (late) — Vision v1: Verdict line + Hook-first draft

### Added
- **VISION.md** — north star. Buddy Scout as a "get the meeting" machine, not a
  research card. Five moves: verdict-first, one-buyer commit, hook-not-pitch,
  sequence, feedback loop.
- **Verdict line** — every packet now opens with a decisive call (Chase / Watch / Skip)
  plus one sentence naming the sharpest signal. Rendered as a colored banner at the top
  of the card, above "Who they are." Makes the decision for the rep, shows work below.
- **Hook-first draft** — the first message is now a short curiosity hook (1-2 sentences,
  their specific pain, NO product pitch) whose only job is to earn a reply. The old
  full-pitch paragraph is kept as the "fuller follow-up." Two copy buttons: "Copy hook"
  (primary) and "Copy follow-up".

### Verified live (Harvey, fresh)
- Verdict: "Chase this. Harvey has 325 open roles, including 40 sales and GTM roles..."
- Hook: "You've got 325 open roles... How is the team keeping screening consistent across
  that hiring push?" — curiosity, no product mention. Exactly the intended shape.

### Still ahead (vision, not yet built)
- Commit to ONE buyer + one reason (still lists 2-3).
- 3-step sequence (hook -> value -> breakup). Only hook + follow-up so far.
- Feedback loop (replied/meeting/dead -> learns which hooks work).
- "Who they are" still thin (recency search pending).
