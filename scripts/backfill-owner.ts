// One-off backfill: tag connections uploaded before the multi-owner `owner` field
// existed. Everything currently in Cosmos came from Tomi's single CSV upload, so we
// stamp owner="Tomi"/ownerKey="tomi" on any record missing it. Idempotent: re-running
// only touches untagged records. Future uploads carry their own owner from the route.
//
// Run: npx tsx scripts/backfill-owner.ts

import { getConnectionsContainer } from "../lib/cosmos";

async function main() {
  const container = await getConnectionsContainer();
  const { resources } = await container.items
    .query({ query: "SELECT * FROM c WHERE NOT IS_DEFINED(c.owner) OR c.owner = null OR c.owner = ''" })
    .fetchAll();
  console.log(`Untagged connections to backfill: ${resources.length}`);
  let n = 0;
  for (const c of resources as any[]) {
    c.owner = "Tomi";
    c.ownerKey = "tomi";
    await container.items.upsert(c);
    n++;
    if (n % 200 === 0) console.log(`  ...${n}`);
  }
  console.log(`Backfilled ${n} connections with owner="Tomi".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
