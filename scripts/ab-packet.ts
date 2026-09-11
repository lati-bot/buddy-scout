// Provenance + A/B: gather facts once, write with all three tiers, compare.
// Validates (1) no invented details, (2) whether smart tiers earn their cost.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { gather } = await import("../lib/gather");
  const { generatePacket } = await import("../lib/packet");
  const { bundleToPrompt } = await import("../lib/facts");

  console.log("Gathering verified facts for Rain (rain.xyz)...\n");
  const { bundle } = await gather({
    domain: "rain.xyz",
    companyName: "Rain",
    boardUrl: "https://jobs.ashbyhq.com/rain",
    knownAbout: {
      text: "Rain builds crypto-native payments and card infrastructure (branded payments, loyalty & rewards).",
      source: { kind: "user", ref: "operator-provided", fetchedAt: new Date().toISOString() },
    },
  });

  console.log("=== FACTS BUNDLE (all the writer may see) ===");
  console.log(bundleToPrompt(bundle));
  console.log("\n(note: 'Solana' appears NOWHERE in these facts — watch if any model invents it)\n");

  for (const tier of ["cheap", "mid", "smart"] as const) {
    const label = { cheap: "LUNA", mid: "TERRA", smart: "SOL" }[tier];
    console.log(`\n\n########## ${label} (${tier}) ##########`);
    try {
      const t0 = Date.now();
      const p = await generatePacket(bundle, tier);
      const ms = Date.now() - t0;
      console.log(`confidence=${p.confidence}  cited=${p.citedFactIds.join(",")}  ${ms}ms`);
      console.log("\n[angle] " + p.strategy.angle);
      console.log("[objection] " + p.strategy.likelyObjection);
      console.log("[counter] " + p.strategy.counter);
      console.log("\n[DRAFT]\n" + p.draft);
      const solana = JSON.stringify(p).toLowerCase().includes("solana");
      console.log("\n>>> mentions 'Solana' (unverified!): " + (solana ? "YES ❌" : "no ✅"));
    } catch (e: any) {
      console.log("ERROR:", e.message);
    }
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
