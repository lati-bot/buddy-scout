# SECURITY-NOTES.md — Buddy Scout

_Written by main Lati, Sep 11 2026. Read before touching Cosmos, keys, or deploys._

---

## 1. Cosmos DB — sharing the Overtaxed account

**Decision (Tomi, Sep 11): reuse the existing Azure Cosmos account. Do NOT create a new one.**

That account holds Overtaxed production data — ~971,738 Cook County property records in the
`properties` container, plus `houston-properties` and ~10 other market containers. Treat it as
live production data belonging to a different product.

### Required isolation

- Create a **separate database** inside the account (e.g. `buddy`), not a loose container
  sitting next to the Overtaxed ones. Keeps namespaces clean and makes it possible to drop or
  migrate Buddy later without touching property data.
- **Dedicated throughput, not shared.** If the account is on provisioned RU/s with
  database-level shared throughput, a busy scraper/collector loop can starve Overtaxed
  queries. Give Buddy containers their own RU/s. If the account is serverless, this is moot —
  confirm which mode before assuming.
- **Never query, read, or write Overtaxed containers.** Buddy has no business touching
  `properties`, `houston-properties`, or any market container. Not for testing, not for
  "just checking the schema."

### Credentials

- **Do not use the Cosmos master key.** Scope access to the Buddy database only, via a
  resource token or RBAC role assignment.
- Rationale: one leaked master key exposes both products. The blast radius of a sales-agent
  side project should not include a million property records.
- If only the master key is available right now, say so and stop — ask Tomi rather than
  shipping with it.

### Known Cosmos gotcha (already paid for once)

`ORDER BY ABS(...)` is not supported in Cosmos SQL. Sort client-side.

---

## 2. Secrets

Current state is good — keep it that way.

- `.gitignore` already covers `.env*` with an `!.env.example` exception. Verified correct.
- `.env.local` is untracked. Verified.
- **Never commit a real key.** `.env.example` holds names only, never values.
- Production secrets go in the **Vercel dashboard**, never in the repo, never in a markdown
  file, never in a memory/workspace note.
- Before any commit that touches env handling, run `git ls-files | grep -i env` and confirm
  only `.env.example` appears.

Keys currently in scope: `PROSPEO_API_KEY`, `SCOUT_PASSWORD`, `SCOUT_SESSION_SECRET`,
`HUNTER_API_KEY`, `ANTHROPIC_API_KEY`, plus whatever Azure OpenAI and Cosmos need.

---

## 3. The auth gate is weak by design — know its limits

`SCOUT_PASSWORD` is a single shared password. That's acceptable for Jolene-only v1, but:

- Anyone who learns the password gets full access. Assume it will eventually leak.
- **Therefore: nothing sensitive behind that gate.** No Overtaxed data, no personal data
  beyond the prospect info the tool exists to serve, no internal business notes.
- `SCOUT_SESSION_SECRET` must be long and random, and must differ between local and prod.
- Rate-limit the login route. A shared password with unlimited attempts is brute-forceable.
- Upgrade to per-user auth before this is used by anyone beyond Jolene.

---

## 4. Scraping and third-party data

Buddy Scout collects company and contact data. That carries real obligations.

- **Respect robots.txt and rate limits.** Back off on 429/Retry-After. No tight loops against
  anyone's site.
- Identify the crawler honestly in the user agent. No spoofing a browser to evade blocks.
- Email lookup (Prospeo/Hunter) returns **personal data on real people**. Store the minimum
  needed, don't build a shadow CRM of scraped individuals, and be ready to delete on request.
- Any outbound email drafted by the agent is a **draft for Jolene to review and send**. The
  agent does not send cold email autonomously. Ever.

---

## 5. Deploy boundary

Per SOUL.md: **only Tomi approves deployments.**

- Build and stage freely. Pushing to a live public URL needs an explicit yes.
- Vercel CLI token on this machine is currently **expired** — CLI deploys will fail until
  Tomi runs `vercel login`. Use the GitHub → Vercel auto-deploy integration instead.
- Full deploy pattern: `/Users/lab/.openclaw/workspace/research/DEPLOY-PLAYBOOK.md`

---

## 6. Quick pre-commit checklist

- [ ] `git ls-files | grep -i env` shows only `.env.example`
- [ ] No API key, connection string, or password in any tracked file
- [ ] No Overtaxed container name or credential referenced in Buddy code
- [ ] Cosmos access scoped to the Buddy database, not master key
- [ ] Anything user-facing going live has Tomi's explicit approval
