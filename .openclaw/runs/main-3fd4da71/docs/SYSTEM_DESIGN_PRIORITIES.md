# Mission Control System Design Priorities

`awesome-system-design-resources` is useful to Mission Control as a decision aid, not as a code dependency. The right move is to extract the few concepts that match Mission Control's real operating model and ignore the rest until the product shape demands them.

## Current Shape

- Local-first Next.js application with API routes and server-side services
- Durable project data in SQLite plus workspace files on disk
- Automation handoff to n8n and other local tools
- Growing set of sidecar-style capabilities such as code graph, workspace intel, and automation endpoints
- Most failures are more likely to come from retries, long-running jobs, stale reads, or missing visibility than from internet-scale traffic

## Pick Now

### 1. Idempotency

Why pick:

- Mission Control already accepts writes from automation flows, reports, and quests.
- Retries from n8n, flaky local services, or user double-submits can create duplicate reports and duplicate quests.
- This is a small implementation cost with immediate operational value.

Why this over more advanced distributed patterns:

- Duplicate writes are a near-term risk in the current app.
- Consensus, locks, and multi-region consistency are not.

What to apply:

- Add idempotency keys to automation write endpoints.
- De-duplicate report and quest creation on stable request fingerprints.
- Log when a request was replayed versus newly applied.

### 2. Push-First Progress Updates Using SSE

Why pick:

- Mission Control already deals with workflows that benefit from live status, and polling creates waste and lag.
- Many UI updates are one-way server-to-client streams, which fit SSE well.
- This improves long-running operations without introducing full real-time system complexity.

Why not WebSockets now:

- Most Mission Control progress flows are server-to-client only.
- SSE is simpler to operate, simpler to proxy, and easier to reason about in a local-first app.
- WebSockets become worth it only when the client must continuously push commands or collaborate in real time.

What to apply:

- Prefer SSE for job progress, automation state, indexing progress, and other one-way status streams.
- Keep polling only as a fallback for simple or low-value surfaces.

### 3. Explicit Async Jobs and Work Queues

Why pick:

- Workspace scans, code graph generation, imports, and exports can outgrow synchronous request-response handling.
- A job model gives Mission Control progress, cancellation, retries, and better UX for heavier operations.
- This aligns with the direction already taken in sidecar features such as transcription jobs.

Why not a distributed message broker now:

- Mission Control is still primarily a local application.
- A local job table and worker loop will cover the current problem space with far less operational overhead than Kafka, RabbitMQ, or a full broker setup.

What to apply:

- Standardize a job record shape: `queued`, `running`, `completed`, `failed`, `canceled`.
- Use jobs for code graph rebuilds, large doc imports, context exports, and future AI-heavy operations.
- Expose job status consistently through API and SSE.

### 4. Cache With Clear Invalidation Rules

Why pick:

- Mission Control already has in-process caches around workspace intel and code graph snapshots.
- The real risk is not lack of caching, it is stale or inconsistent cache behavior.
- Formalizing cache keys, TTLs, and invalidation rules will improve both correctness and latency.

Why not distributed cache or CDN now:

- Mission Control is not serving a global public workload.
- External caching layers would add moving parts without solving the most likely current failure mode.

What to apply:

- Document which reads are cacheable and for how long.
- Invalidate caches on file changes, project switches, and write endpoints that affect derived views.
- Emit metadata on whether a response came from cache or fresh computation.

### 5. Rate Limiting and Backpressure

Why pick:

- Automation endpoints can be triggered by loops, retries, or misconfigured workflows.
- Local tools can still overwhelm a single-node app if they flood document, graph, or automation APIs.
- This is especially relevant once more sidecars and agents call into Mission Control.

Why not an API gateway first:

- The problem is request discipline, not edge-network complexity.
- A lightweight per-route or per-token limiter inside Mission Control is enough for now.

What to apply:

- Protect automation, import, and graph-building routes first.
- Return explicit `429` responses with retry guidance.
- Add concurrency caps for expensive operations, not just request-per-minute limits.

### 6. Tracing and Correlated Logs

Why pick:

- Mission Control spans UI actions, API routes, server services, workspace scans, and local automation calls.
- Failures will often be multi-step and hard to debug without a shared request or job ID.
- This gives disproportionate value once the app coordinates more tools.

Why not full observability stack rollout first:

- The need is correlation and diagnosis, not enterprise telemetry volume.
- Start with structured logs and trace IDs before adding heavier tracing infrastructure.

What to apply:

- Attach request IDs and job IDs across API boundaries.
- Log external tool calls with duration, status, and target service.
- Make trace IDs visible in error payloads and admin/debug views.

## Defer For Now

### Microservices, Service Discovery, and Heartbeats

Why not now:

- Mission Control is still easier to operate as a local-first application with a few known sidecars.
- Static local configuration is enough while service count stays low and topology stays predictable.

Revisit when:

- services start appearing and disappearing dynamically
- multiple workers or hosts need to coordinate automatically

### Distributed Locks, Consensus, and Gossip

Why not now:

- These solve coordination problems that Mission Control does not currently have.
- Introducing them now would be architecture theater.

Revisit when:

- multiple processes can mutate the same durable state concurrently in unsafe ways
- leader election or shared scheduling becomes a real failure mode

### Sharding, Consistent Hashing, and Multi-Node Data Distribution

Why not now:

- Current constraints are product maturity and workflow clarity, not storage scale.
- SQLite and local workspace data are still the right defaults for the product stage.

Revisit when:

- data volume or concurrent write load is actually forcing a storage redesign

### WebSockets-First Architecture

Why not now:

- Most Mission Control interactions are CRUD, document views, and one-way progress streams.
- WebSockets would increase complexity without changing the product meaningfully today.

Revisit when:

- live collaborative editing
- multi-user presence
- two-way command streams that must stay open continuously

### Event-Driven Everything

Why not now:

- Mission Control still benefits from explicit request-response flows for clarity and debuggability.
- Event-driven patterns should be introduced selectively around jobs and automations, not imposed across the whole app.

Revisit when:

- independent subsystems truly need loose coupling and asynchronous fan-out

## Practical Reading Order From The Resource Repo

If using `awesome-system-design-resources` to improve Mission Control, read in this order:

1. Idempotency
2. Rate Limiting
3. Long Polling vs WebSockets
4. Pub/Sub and Message Queues
5. Caching Strategies
6. Distributed Tracing

Everything else is secondary until Mission Control stops behaving like a local-first control plane and starts behaving like a distributed platform.
