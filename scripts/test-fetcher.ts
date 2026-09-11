// Multi-ATS fetch + normalization eval (DESIGN.md §2B).
// Tests: detection from URL, all five adapters, normalization into one Role shape.
import { config } from "dotenv";
config({ path: ".env.local" });

interface Target { name: string; boardUrl?: string; slugGuess?: string; }

// Mix of URL fast-path and slug-detection, across ATS types.
const TARGETS: Target[] = [
  { name: "Rain (Ashby, url)", boardUrl: "https://jobs.ashbyhq.com/rain" },
  { name: "Stripe (Greenhouse, slug)", slugGuess: "stripe" },
  { name: "Spotify (Lever, slug)", slugGuess: "spotify" },
  { name: "NBCUniversal3 (SmartRecruiters, slug)", slugGuess: "NBCUniversal3" },
  { name: "bunq (Recruitee, slug)", slugGuess: "bunq" },
];

async function main() {
  const { fetchRoles, rolesToText } = await import("../lib/fetcher");
  for (const t of TARGETS) {
    process.stdout.write(`\n=== ${t.name}\n`);
    const r = await fetchRoles({ boardUrl: t.boardUrl, slugGuess: t.slugGuess });
    process.stdout.write(`   ats=${r.ats} ok=${r.ok} roles=${r.roles.length}${r.error ? " err=" + r.error : ""}\n`);
    // show first 3 normalized roles to eyeball the normalization
    for (const role of r.roles.slice(0, 3)) {
      process.stdout.write(
        `   • ${role.title}` +
        `${role.department ? " | " + role.department : ""}` +
        `${role.workplaceType ? " | " + role.workplaceType : ""}` +
        `${role.postedAt ? " | " + role.postedAt.slice(0, 10) : ""}` +
        `${role.salary?.min ? " | $" + role.salary.min + "-" + (role.salary.max ?? "?") : ""}\n`
      );
    }
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
