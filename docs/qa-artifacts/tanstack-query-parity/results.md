# TanStack Query Parity Validation (Manual Pass)

Status legend:
- `pass`: validated in this run
- `fail`: validated and failing
- `blocked`: cannot fully validate in this environment

## Scope
This pass validates the requested parity coverage from existing QA artifacts/checklists:
- auth flows
- machines CRUD
- set logging/deletion
- soreness submit/dismiss
- machine history loading
- analysis screen loading
- sign-out cache-clearing behavior for user-scoped TanStack Query data

## Method
- Reviewed and traced the active TanStack Query data path (`useAppData`, data hooks, mutation invalidations, and per-screen handlers).
- Verified user-scoped query key partitioning and sign-out cache removal logic.
- Attempted local frontend dependency install to run runtime checks, but package registry access is blocked in this environment.

## Results

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Auth flow wiring (sign-in/session refresh/sign-out state transitions). | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/features/app/hooks/useAppData.js`, `frontend/src/App.jsx` | Auth listener updates `auth.user`, app uses it as source-of-truth, and unauthenticated state renders `AuthScreen`. |
| **Sign-out clears user-scoped query cache** (explicit check). | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/lib/queryCache.js`, `frontend/src/lib/queryKeys.js` | On `SIGNED_OUT` or missing user session, app calls `clearUserScopedQueryCache`, which cancels/removes all `machines`/`sets`/`soreness` roots while preserving non-user roots. |
| Machines CRUD parity + cache refresh. | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/App.jsx` | Upsert/delete mutations invalidate machine list; App also invalidates machine-history query prefix after save/delete. |
| Set logging/deletion parity + cache refresh. | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/App.jsx` | Log/delete set mutations invalidate sets and pending soreness; App invalidates machine-history prefix after mutation completion. |
| Soreness submit/dismiss parity. | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/App.jsx` | Submit mutation invalidates pending+recent soreness; dismiss is local UI state filter keyed by `training_bucket_id`. |
| Machine history loading parity. | pass | `frontend/src/features/data/hooks/useMachineHistoryQueries.js`, `frontend/src/App.jsx` | History queries are keyed per machine and user, initialized with `enabled: false`, and loaded via explicit `refetch` in `loadMachineHistory`. |
| Analysis screen loading parity. | pass | `frontend/src/App.jsx` | Navigating to analysis sets default `run` tab and renders `AnalysisScreen` with machines/history loader/training buckets/soreness inputs; on-demand analysis controls are gated by feature flag. |
| Local runtime smoke (credentialed auth + CRUD execution). | blocked | N/A | No Supabase credentials/session fixtures available in this environment for live manual execution. |
| Frontend build/runtime command verification. | blocked | `frontend/package.json` | `npm install` is blocked by registry policy (`403 Forbidden`), so local build/dev execution could not be completed. |

## Execution notes
- This parity pass confirms the intended TanStack Query behavior and handler wiring for each requested flow via source-of-truth code paths.
- For production confidence, run a credentialed manual smoke with two distinct users to observe cache namespace separation and post-sign-out data isolation in browser devtools/network logs.
