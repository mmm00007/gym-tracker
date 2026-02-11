# Phase 0–3 Implementation Review (Codebase Audit)

Date: 2026-02-11

## Verdict

- **Phase 0:** Implemented.
- **Phase 1:** Largely implemented, with a few semantic/cleanup gaps.
- **Phase 2:** Implemented.
- **Phase 3:** Implemented.
- **Readiness for Phase 4:** **Partially ready** (on-demand trigger/evidence are present, but persistence/listing/scheduled trends are not implemented).

## Highlights by phase

### Phase 0 — Stabilization baseline

- Rollout flags are implemented in backend (`setCentricLogging`, `libraryScreenEnabled`, `analysisOnDemandOnly`) and exposed via `/api/rollout-flags`.
- Frontend resolves flags from backend with env fallback defaults.
- Data contract lock doc exists and specifies set logging, grouping payload, soreness, and recommendation/evidence contracts.

### Phase 1 — Data model completion

- `machines` table has neutral `equipment_type` enum and constraints.
- Type-specific DB validation exists for machine-only media fields.
- `sets` are user-owned (`user_id`) with nullable legacy `session_id`.
- `training_date` + `training_bucket_id` are auto-computed by trigger.
- Optional `workout_cluster_id` is present and automatically recomputed with gap clustering.
- Soreness links to `training_bucket_id`.
- Recommendation scopes are persisted with grouping/date/set-type policy.

### Phase 2 — Core logging UX refactor

- Home CTA uses Log Sets / Library / Analyze / History navigation.
- Logging no longer depends on active session creation/end lifecycle.
- Post-log flow preserves selected exercise + settings and gives immediate feedback.
- Set type defaults to `working`, with per-exercise memory.
- Analytics supports all / working-only / custom set-type filtering.
- Duration policy is respected: null allowed and surfaced as unknown.

### Phase 3 — Library-first curation UX

- Dedicated `LibraryScreen` exists with create/edit/delete.
- Search and filter chips by equipment type + muscle group exist.
- `MachineCard` is reused for list rendering.
- Log flow selection is existing-only with optional “Go to Library” shortcut.
- Edit/create form conditionally hides machine-specific media controls for non-machine types.
- Default equipment seeding on auth/data load is wired via bootstrap RPC.

## Gaps and risks found

1. **Phase 4 persistence missing**
   - No `analysis_reports` table or wiring in schema.
   - No backend endpoint that writes recommendation/analysis outputs to persistent storage.
   - No frontend report list/detail UI for previously generated analyses.

2. **Weekly trends automation missing**
   - No scheduler/worker/cron path for weekly trend generation.
   - No “Trends” section consuming persisted weekly outputs.

3. **Feature-flag default risk for shipped behavior**
   - Frontend safe defaults are all `false`, meaning Library/analysis-on-demand behavior can be disabled unless env/backend flags are explicitly enabled.
   - This is fine for staged rollout, but can silently hide Phase 2/3 UX in misconfigured environments.

4. **Naming/semantic drift still visible in app code**
   - UI and code still carry many `machine` identifiers, and there is dead/unused `CameraScreen` identify flow in App that appears detached from current log flow.
   - Not a blocker, but increases maintenance overhead and can confuse future Phase 4 work.

## Recommended pre-Phase-4 checklist

1. Add and migrate `analysis_reports` schema now (with scope metadata and evidence JSON).
2. Add backend endpoint that generates + stores each report, and returns report id.
3. Add frontend Analyze history list/detail before introducing weekly trends.
4. Add scheduled generation pipeline for weekly trend reports.
5. Add one env/profile where flags default ON for phase-complete smoke tests.
6. Remove or intentionally wire legacy/unused identify code paths to reduce ambiguity.

