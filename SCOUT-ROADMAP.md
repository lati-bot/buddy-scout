# SCOUT-ROADMAP.md — From Dossier to “Just Hit Send”

> Written 2026-09-12 after grounding Scout against PRODUCT-BUDDY.md and
> WHAT-JOLENE-WANTS.md, reading the real implementation, and running live packet
> generation against Rain (rain.xyz).
>
> This is a product roadmap, not a feature wishlist. The test for every item:
> **does it help Jolene send better outreach, faster, and book more meetings?**

---

## Ground truth: what exists today

Scout already has a strong technical foundation:
- Verified-facts-only packet generation; the writer cannot see unsupported claims.
- Resolved citations and a confidence floor.
- A decisive `chase / watch / skip` verdict.
- A short first-touch hook plus a fuller follow-up draft.
- Queue ordering based on hiring freshness, open-role count, known contact, and warm path.
- `contacted` / `closed` states and scheduled rechecking.
- Buyer research using public sources only.
- Team LinkedIn-network matching, including who can broker an introduction.
- Scheduled collection, currently limited to a fixed seed file.

The architecture is trustworthy. The biggest gaps are product understanding,
message quality, supply, and learning from outcomes.

---

## What the live test proved

Test company: **Rain (rain.xyz)**

Verified signal collected successfully:
- 47 open roles.
- 8 posted within roughly two weeks.
- Hiring across engineering, partnerships, compliance, people, and other functions.
- No invented “Solana” claim appeared in any model output.

### What worked
- The verdict was decisive: **Chase**.
- The message used a sharp, current signal: 47 roles and recent hiring velocity.
- The hook was specific to Rain rather than a mail-merge template.
- All three model tiers stayed grounded in verified facts.
- The existing pipeline can produce useful evidence for outreach.

### What did not work
The drafts consistently described Buddy as **“AI resume screening / hiring support.”**
That is technically adjacent but strategically weak and incomplete.

Buddy’s actual value is:
- interviewing every applicant;
- evaluating each person against the role and the employer’s explicit criteria;
- continuously categorizing candidates by role fit;
- helping the hiring team spend human interview time on the right people.

The live Luna hook was:
> “How are you keeping candidate review consistent across partnerships,
> engineering, compliance, and people operations?”

It is credible, but abstract and easy to ignore. It does not land the founder’s
felt pain: **we cannot meaningfully screen everyone, but we cannot afford to miss
strong candidates or waste time on obvious non-fits.**

The draft was also too generic (“resume screening and hiring support”), which
makes Buddy sound like another ATS feature instead of an AI interviewer that can
speak with every applicant.

### Model-tier observation
- Luna was usable but generic.
- Terra and Sol were somewhat sharper, but all three inherited the same product-
  positioning flaw from the prompt.
- Therefore: **fix the product brief and evaluation rubric before spending more
  on stronger models.** Model tier is not the primary bottleneck.

---

## Entry-point audit

### What is genuinely strong
- Warm path is checked first.
- Connections are team-wide and tagged by owner.
- The card can say who knows the buyer and who should broker the introduction.
- Buyer names/titles must come from fetched evidence; no invented people.
- Confirmed vs likely vs thin is explicit.

### What needs correction
Current buyer logic assumes:
- Buddy mainly sells “resume-screening / interview-integrity”;
- targets primarily hire engineers;
- founder is always first, then talent, then engineering;
- NYC/Chicago proximity is a major advantage.

Those assumptions are too narrow.

Buddy works across **any role**, and the right buyer depends on company context:
- Tiny/startup without a recruiting team: founder or functional hiring owner.
- Growing startup with recruiting leadership: Head of Talent / Recruiting / People.
- Larger company: recruiting operations, talent acquisition leadership, or the
  owner of high-volume screening workflow.
- CTO / Head of Engineering is relevant when technical hiring is the active pain,
  not a universal third choice.

Warmth should beat cold hierarchy, but the system must not recommend a weakly
relevant warm contact as the buyer. A warm contact can be the **path to** the buyer.

---

# Re-ordered roadmap

## Phase 1 — Prove the send

**Goal:** Jolene can read the recommendation and send the message with little or
no rewriting.

### 1. Correct Scout’s product understanding
Update every sales/buyer prompt and heuristic to use PRODUCT-BUDDY.md:
- Role fit first; resume is useful context, not the product’s center.
- Buddy interviews every applicant.
- Employer criteria + role requirements guide the interview.
- Candidate assessment updates continuously as interviews happen.
- Value = fewer wasted human interviews **and** less chance of missing strong people.
- Do not claim product capabilities that Dev Difference has not confirmed.

### 2. Make buyer selection contextual
Replace universal “founder → talent → engineering” ordering with company-aware
buyer reasoning. Separate:
- **Buyer:** person who owns the pain/budget/workflow.
- **Warm path:** person who can introduce Jolene to that buyer.

### 3. Improve the hook around felt pain
The hook should connect verified hiring intensity to one specific, human problem.
It should not merely repeat open-role counts or ask an abstract process question.
It should earn a reply without pitching Buddy.

Example direction, not a fixed template:
> “Forty-seven open roles is a lot of first conversations to get right. How are
> you making sure strong applicants don’t disappear in the volume before a hiring
> manager ever meets them?”

### 4. Create a real send-quality gate
Test at least 10 varied companies:
- tiny founder-led startup;
- scaling startup with a talent leader;
- larger recruiting team;
- high hiring volume;
- moderate volume but rapid recent posting;
- thin-fact company;
- non-fit company;
- warm connection to buyer;
- warm connection only to an employee;
- stale or stopped hiring.

For each, grade:
1. Is the buyer right?
2. Is “why now” verified and sharp?
3. Does the hook sound human and invite a reply?
4. Does the draft explain the real Buddy without overclaiming?
5. Would Jolene send it unchanged, lightly edit it, or reject it?

**Exit criterion:** at least 8/10 hooks and drafts are “send unchanged” or “light
edit,” with zero invented claims and no wrong-buyer recommendations.

---

## Phase 2 — Keep the well full

**Goal:** Fresh, high-intent companies appear without Jolene sourcing them.

Build the live ATS harvester around the correct signal:
- Software companies actively hiring.
- Rank by open-role volume, recency, and velocity.
- No role-type restriction; Buddy can serve PM, engineering, sales, operations,
  and other roles.
- Start with public Greenhouse, Lever, and Ashby boards.
- Maintain a paced startup-board registry; dedupe against Cosmos.
- Cap research volume and never spend on obviously weak/stale companies.

**Important:** polling ATS boards requires knowing company board slugs. V1 uses a
curated registry. Self-expanding discovery is a separate capability and should not
be falsely described as solved.

**Exit criterion:** queue remains stocked with relevant, fresh companies for four
weeks without manual company entry, while low-fit noise stays acceptably low.

---

## Phase 3 — Close the loop

**Goal:** Scout learns what actually earns replies and meetings.

Track, with minimal burden:
- sent / skipped;
- channel and final edited message;
- replied / no reply;
- positive reply / meeting booked / not interested;
- reason for skip or rejection when useful.

Use outcomes to improve:
- lead score;
- buyer choice;
- hook angle;
- message language;
- source quality.

Do not optimize for sends alone. North-star outcome is **qualified replies and
booked meetings**.

**Exit criterion:** Scout can show which lead signals, buyer personas, and hook
angles produce better reply/meeting rates, and use that evidence in tomorrow’s
recommendations.

---

## Phase 4 — Make the seat effortless

**Goal:** phone and laptop both support the actual daily workflow.

- Mobile-first review, copy, send, skip, and outcome capture.
- Short daily list; no giant research dashboard as the default.
- Keep source detail available for trust, but collapsed until needed.
- Strong suppression for contacted, closed, duplicate, stale, and known non-fit leads.
- Clear distinction between verified facts, assumptions, and recommendations.

**Exit criterion:** Jolene can process the day’s list from her phone without needing
a laptop, while the laptop remains best for deeper review and configuration.

---

## Build order decision

Do **not** scale lead collection before proving the send. A full queue of generic or
mispositioned messages burns Jolene’s trust faster than an empty queue.

Order:
1. Correct product and buyer reasoning.
2. Validate real hooks/drafts.
3. Build live supply.
4. Capture outcomes and learn.
5. Polish phone + laptop workflow around observed usage.

---

## Standing product mindset

Think as Jolene, who sells Buddy:
- She wants meetings, not research.
- She needs a trustworthy teammate, not another tool to manage.
- She should spend her judgment on human conversations, not list triage.
- Be thoughtful before coding. Test assumptions and live sources first.
- Trust strategic intuition, but verify mutable facts and real outputs.
- When blocked by ambiguity, return to the founder’s pain and Jolene’s daily job.

The end state:
> **The right company, the right person, the right reason now, and words Jolene
> would actually send — ready when she opens the app.**
