import { CosmosClient, Container, Database } from "@azure/cosmos";

// Buddy Scout owns ONLY its own database. It must never touch the
// Overtaxed containers (properties, houston-properties, market_*) that
// share this Cosmos account. See SECURITY-NOTES.md §1.

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || "buddy";
const containerId = process.env.COSMOS_CONTAINER || "companies";

let _client: CosmosClient | null = null;
let _container: Container | null = null;

export function cosmosConfigured(): boolean {
  return Boolean(endpoint && key);
}

function client(): CosmosClient {
  if (!endpoint || !key) {
    throw new Error("Cosmos not configured: set COSMOS_ENDPOINT and COSMOS_KEY.");
  }
  if (!_client) _client = new CosmosClient({ endpoint, key });
  return _client;
}

/**
 * Ensures the buddy database + companies container exist, partitioned on /domain.
 * Safe to call repeatedly (createIfNotExists). Never references Overtaxed data.
 */
export async function getContainer(): Promise<Container> {
  if (_container) return _container;
  const c = client();
  const { database }: { database: Database } =
    await c.databases.createIfNotExists({ id: databaseId });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: ["/domain"] },
  });
  _container = container;
  return _container;
}
