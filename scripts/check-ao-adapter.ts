import { buildAgentDispatchMetadata, normalizeDispatchHandoffs, readAgentDispatchMetadata } from "../src/lib/agents/dispatch-metadata.ts";
import { extractAoSessionIds } from "../src/lib/agents/ao-parser.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function checkSessionExtraction() {
  const fixture = [
    "spawn complete\nsession: sess_abc123\nstatus: running",
    "{\"ok\":true,\"sessionId\":\"session_json_456\"}",
    "restore done -> session/sess_route_999",
    "sid = sid_short_42",
  ].join("\n\n");

  const ids = extractAoSessionIds(fixture);
  assert(ids.includes("sess_abc123"), "Expected sess_abc123 in extracted sessions");
  assert(ids.includes("session_json_456"), "Expected session_json_456 in extracted sessions");
  assert(ids.includes("sess_route_999"), "Expected sess_route_999 in extracted sessions");
  assert(ids.includes("sid_short_42"), "Expected sid_short_42 in extracted sessions");
}

function checkDispatchMetadata() {
  const metadata = buildAgentDispatchMetadata({
    agentId: "agent-1",
    openclawAgentId: "oc-12",
    backend: "agent-orchestrator",
    sessionId: "sess_primary",
    command: "node",
    args: ["packages/cli/dist/index.js", "spawn"],
    parsed: { status: "running" },
    handoffs: [
      { agentId: "agent-2", name: "Follow-up", ok: true, summary: "Done", sessionId: "sess_handoff" },
      { nope: true },
    ],
  });

  assert(metadata.handoffs.length === 1, "Expected only valid handoff rows to survive normalization");
  const roundTrip = readAgentDispatchMetadata(metadata);
  assert(roundTrip?.agentId === "agent-1", "Expected roundtrip metadata to preserve agentId");
  assert(roundTrip?.backend === "agent-orchestrator", "Expected roundtrip metadata backend");
  assert(roundTrip?.handoffs[0]?.sessionId === "sess_handoff", "Expected handoff session to be preserved");

  const loose = normalizeDispatchHandoffs([
    { agentId: "a", name: "n", ok: false, summary: "", sessionId: "" },
  ]);
  assert(loose[0]?.ok === false, "Expected explicit false handoff status to persist");
}

function main() {
  checkSessionExtraction();
  checkDispatchMetadata();
  console.log("check-ao-adapter: ok");
}

main();
