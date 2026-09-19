import assert from "node:assert/strict";
import { newCompany, applyOutreachAction, type Company } from "../lib/company";
import { hasFreshSuccessfulCheck } from "../lib/research-state";

// No network/credentials: replace dependency modules before requiring repository/orchestrator.
globalThis.fetch = (async () => { throw new Error("Network forbidden in persistence tests"); }) as typeof fetch;
function stub(path: string, exports: object) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
let row: Company & { _etag: string };
let version = 0;
let conflict: (() => void) | null = null;
function persist(value: Company) { row = structuredClone({ ...value, _etag: String(++version) }); return { resource: structuredClone(row) }; }
const container = {
  item: () => ({
    read: async () => ({ resource: structuredClone(row) }),
    replace: async (value: Company, options: { accessCondition: { condition: string } }) => {
      if (conflict) { const fn = conflict; conflict = null; fn(); }
      if (options.accessCondition.condition !== row._etag) throw Object.assign(new Error("Conflict"), { code: 412 });
      return persist(value);
    },
  }),
  items: { upsert: async () => { throw new Error("Unconditional upsert forbidden"); } },
};
stub("../lib/cosmos", { getContainer: async () => container });
let gatherResult: any;
let duringGather: (() => void) | null = null;
stub("../lib/gather", { gather: async () => { duringGather?.(); return gatherResult; } });
let packet: Record<string, unknown>;
stub("../lib/packet", { generatePacket: async () => packet });
const { scout } = require("../lib/scout") as typeof import("../lib/scout");
const { recordOutreachAction, saveBuyerResearch } = require("../lib/repo") as typeof import("../lib/repo");

function reset() {
  const now = new Date().toISOString();
  const company = newCompany("example.com");
  company.status = "hiring";
  company.hiring = { isHiring: true, roles: ["Engineer"], source: "https://example.com/jobs", seenAt: now };
  company.lastCheck = { status: "confirmed-hiring", checkedAt: now, error: null };
  company.lastCheckedAt = now;
  packet = { hook: "Your engineering role is open.", evidenceStatus: "cited", generatedAt: now, verdict: { call: "chase" } };
  company.packet = { fast: packet, deep: null, generatedAt: now };
  company.outreach!.draft = { recipientName: "Jamie", recipientTitle: "Founder", firstTouch: "Old draft", followUp: "", packetGeneratedAt: now, generatedAt: now };
  persist(company);
  conflict = null; duringGather = null;
  gatherResult = { bundle: { domain: "example.com", companyName: "Example", facts: [], generatedAt: now }, fetch: { ok: true, roles: [{ title: "Engineer" }], boardUrl: "https://example.com/jobs" } };
}

async function main() {
  reset();
  conflict = () => persist({ ...row, description: "Concurrent metadata" });
  await recordOutreachAction("example.com", "sent");
  assert.equal(row.description, "Concurrent metadata");
  assert.equal(row.outreach?.state, "sent");
  assert.equal(row.outreach?.events.length, 1);

  reset();
  duringGather = () => persist(applyOutreachAction(row, "sent"));
  await scout("example.com", { force: true });
  assert.equal(row.status, "contacted");
  assert.equal(row.outreach?.state, "sent");
  assert.equal(row.outreach?.events.length, 1);
  assert.equal(row.outreach?.draft, null);

  reset();
  gatherResult.fetch.roles = [];
  const empty = await scout("example.com", { force: true });
  assert.equal(empty.company.hiring.isHiring, false);
  assert.equal(empty.company.packet.fast, null);
  assert.equal(empty.company.outreach?.draft, null);
  assert.equal(empty.packet, null);

  reset();
  gatherResult.fetch = { ...gatherResult.fetch, ok: false, roles: [], error: "timeout" };
  const failed = await scout("example.com", { force: true });
  assert.equal(failed.company.hiring.isHiring, true, "historical evidence retained");
  assert.equal(failed.company.lastCheck?.status, "unavailable");
  assert.equal(failed.company.outreach?.draft, null);
  assert.equal(failed.packet, null);
  assert.equal(hasFreshSuccessfulCheck(row), false);
  const retry = await scout("example.com");
  assert.equal(retry.cached, false);
  assert.equal(retry.atsFound, false);

  reset();
  const old = row.outreach!.draft!;
  persist({ ...row, packet: { ...row.packet, generatedAt: "2026-09-12T00:00:00.000Z" } });
  await saveBuyerResearch("example.com", {}, old);
  assert.equal(row.outreach?.draft, null, "superseded packet cannot acquire a stale addressed draft");
  console.log("persistence: CAS conflict retry, concurrent sent preservation, empty/failure invalidation, failed-cache retry and packet-version checks passed (offline)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
