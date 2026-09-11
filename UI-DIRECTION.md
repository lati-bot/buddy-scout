# UI-DIRECTION.md — Buddy Scout

_Researched by main Lati, Sep 11 2026, at Tomi's request. Read before writing UI._

**Tomi's constraint: functionality is the priority. UI should be simple, restrained, and
not eat time. Black-and-white-leaning is approved. Don't gold-plate this.**

Also: the product is called **Buddy Scout**, not "Buddy." Buddy is the real product; Scout
is the sales-agent tool. Use the full name.

---

## 1. Install one skill. Not five.

### Primary — Anthropic's official `frontend-design`

```
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

Source: `anthropics/claude-code/plugins/frontend-design`. First-party, free, maintained.

What it actually does: forces a **commitment to an aesthetic direction before code is
written**, instead of defaulting to the generic AI look (Inter + purple gradient + rounded
cards + three-icon feature grid). That is exactly the failure mode we care about.

### Optional cleanup pass — `ui-skills` (ibelick)

```
npx ui-skills get baseline-ui
```

Not a style, a **fixer**. `baseline-ui` deslops existing UI: one accent, default shadow
scale, tabular numerals, no gradients, no glow. Siblings: `fixing-accessibility`,
`fixing-motion-performance`. Use *after* screens exist, as a QA pass. It does not generate.

### Deliberately skipped

- **UI/UX Pro Max** (~99k stars) — a searchable knowledge base of palettes and font pairings
  for *choosing* a direction. We already chose. Adds setup and context weight for no gain.
- **awesome-design-skills / typeui.sh** — 67 named aesthetics (glassmorphism, brutalism…).
  One frozen look per file. Only useful if you want a specific style, which we don't.
- **superdesign** — renders variants in a canvas. Interesting, but it's a workflow tool and
  this project doesn't have the UI budget to justify it.

### The research finding that matters most

In a head-to-head test (adding a page to an *existing* app), style-preset skills actively
hurt: glassmorphism bolted a light frosted page onto a dark trading app. The agent with
**no skill at all**, just reading the existing codebase, correctly matched the house style.

**Implication: skill value is highest at project start, setting direction. Once Buddy Scout
has a look, match the existing code rather than pulling in more skills.**

---

## 2. The actual visual direction

Monochrome-first, one accent. Closer to Linear / Stripe docs than a literal grayscale page.

- **Not `#000` on `#fff`.** Too harsh, reads cheap. Use near-black text (~`#111`–`#1a1a1a`)
  on off-white (~`#fafafa`–`#f7f7f5`).
- **One accent color, used only for actions and status.** Buttons, links, hot/hiring badges.
  Nowhere else. This is what keeps monochrome from feeling dead.
- **Hierarchy via weight and spacing, not color.** In a near-monochrome palette, whitespace
  and type weight are the only tools. Use them deliberately.
- **Tabular/monospaced numerals** for anything numeric (counts, dates, confidence scores).
  Cheap, and instantly reads as "considered."
- **One font family.** A good grotesk or a system stack. Not Inter — it is the single
  strongest AI tell right now.
- **Sharp or barely-rounded corners.** Heavy border-radius everywhere is an AI tell.
- Dark mode: **not now.** It doubles the surface area for zero functional gain.

## 3. Hard no-list (from `research/ai-design-tells.md` in the main workspace)

- No purple/indigo gradients. No Inter. No dark mode with neon accents.
- No card grids, no three-boxes-with-icons, no perfectly symmetric hero layouts.
- No emoji as section icons (🔍📊🚀💡⚡).
- No bold-lead + explanation bullet lists for every block.
- Vary sentence length and section rhythm in any copy.

The full checklist lives at `/Users/lab/.openclaw/workspace/research/ai-design-tells.md`.
Read it before anything goes in front of Jolene.

## 4. Logo

Tomi has Azure Foundry image models available. **Use `gpt-image-2`** — best text rendering
of the options, and first-party so auth/billing are already wired. `FLUX.2-pro` is the
alternative if the mark is purely visual with no lettering.

For a monochrome product, the logo should work in **one color at 16px**. Generate several,
pick one, don't iterate forever. Ask Tomi before committing a final mark.

---

## 5. Rule of thumb

Ship the function. Make the UI quiet and consistent. If a UI decision takes more than a few
minutes, pick the plainer option and move on.
