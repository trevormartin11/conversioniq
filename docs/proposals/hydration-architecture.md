# Proposal: replace whole-DB hydration with targeted reads

**Status: proposed, NOT implemented** (deliberately deferred from the June 2026 test-sweep
fix phase — too structural to land days before campaign launch). Everything dangerous about
the current design has been defused in code: hydration reads are paginated and fail-closed,
and the send paths no longer trust in-memory guards (they claim via conditional DB writes).
What remains is cost and scale, not correctness.

## The problem (measured)

Every page render AND every server action calls `ensureData()`, which loads **all ~19
tables** into memory (`loadDatasetLive`) before touching a single row:

- **22 Supabase round-trips per request**, 3.85 MB at 1k-row tables (~17 MB at 5k), measured
  against a local PostgREST stub on the production build.
- ~46 GB/month of Supabase egress at modest usage; server RSS grew 246→495 MB over 27
  requests from hydration churn.
- `React.cache()` dedupes hydration within one RSC render, but is **inert in server actions
  and route handlers** (verified against react 19.2.7 internals) — every action pays 2+ full
  hydrations (one inside `getCurrentUser`).
- The shared `globalThis.__ciqRuntime.data` snapshot is replaced under all concurrent
  requests, which made every in-memory check-then-act guard stale by construction (the root
  substrate of the double-send class fixed in batch B).

## Proposed end state

1. **Request-scoped data, not process-global.** Hold the per-request Dataset in
   `AsyncLocalStorage` (or pass it explicitly), so a request's reads are stable regardless of
   concurrent hydrations. `globalThis` keeps only mock-mode state.
2. **Targeted read-models.** Each page needs 2–4 tables, usually filtered/aggregated:
   - Command Center: campaigns + today's metrics + pending-reply count (3 queries, SQL sums).
   - Replies: pending + recent-handled pages (indexed `status, received_at`).
   - Leads: paged leads + suppression COUNT (not the rows).
   - Suppression checks: `select 1 where lower(email) = $1 or lower(domain) = $2` with the
     existing indexes — O(1) instead of hydrating the universe.
3. **Mutations read-modify-write through the DB**, not the snapshot (largely done in batch
   B/D via conditional writes; finish the stragglers: counters via SQL increments/RPC).
4. **Keep the Dataset shape for mock mode** so the seed-driven preview and the test suite
   stay exactly as they are; live mode swaps the selector implementations, not the pages.

## Migration path (incremental, each step shippable)

1. Add per-read-model query functions alongside the existing selectors (same signatures).
2. Convert the 3 hottest surfaces first: dashboard layout (every request), `/replies`,
   `getCurrentUser` (drop its `ensureData`).
3. Convert actions one by one — each conversion shrinks the race window and the egress bill.
4. Remove `loadDatasetLive` once nothing calls it; drop the per-request hydration entirely.

## Effort & risk

Roughly 2–4 focused days. Risk is regression in the read-models (the queries move from
TypeScript array scans to SQL); the existing 214-test suite covers the pure logic, and each
converted page can be verified against the old selector output in mock mode. Recommended
window: the week AFTER launch, once real traffic exists to validate against.
