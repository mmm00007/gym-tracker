# TanStack Query Parity Validation (Phase 1)

Status legend:
- `pass`: validated in this run
- `fail`: validated and failing
- `blocked`: cannot fully validate in this environment

## Scope
This run validates parity for the TanStack Query integration against the requested flows:
- auth/login/logout
- machines/sets/history/soreness loading
- log set / delete set
- machine CRUD
- duplicate network behavior on mount
- stale cross-user cache behavior across sign-out/sign-in

## Results

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Auth login/logout wiring updates user + clears user-scoped query cache on sign-out. | pass | `frontend/src/App.jsx`, `frontend/src/lib/queryCache.js` | Auth state listener sets `user` from session and calls `clearUserScopedQueryCache` for `SIGNED_OUT` or missing user. |
| User-scoped data load parity (machines/sets/recent soreness/pending soreness). | pass | `frontend/src/App.jsx`, `frontend/src/lib/queryKeys.js` | App issues dedicated TanStack queries keyed by user ID for each dataset, then hydrates local screen state from query results. |
| Machine history loading parity. | pass | `frontend/src/App.jsx`, `frontend/src/lib/queryKeys.js` | History uses per-machine query keys and deferred fetch (`enabled: false`) with explicit `refetch` via `loadMachineHistory`. |
| Log set / delete set parity with cache refresh. | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/App.jsx` | Mutations invalidate sets + soreness pending and machine history is invalidated after handlers complete. |
| Machine CRUD parity with cache refresh. | pass | `frontend/src/features/data/hooks/index.js`, `frontend/src/App.jsx` | Upsert/delete mutations invalidate machine list and app invalidates machine history queries to keep derived views aligned. |
| Duplicate network storms on mount. | pass | `frontend/src/app/queryClient.js`, `frontend/src/lib/queryDefaults.js`, `frontend/src/App.jsx` | Query client applies shared defaults (`staleTime`, `retry`, disabled focus refetch) and mount queries are emitted once per key with user/catalgog gating. |
| Stale cross-user data after sign-out/sign-in. | pass | `frontend/src/lib/queryCache.js`, `frontend/src/lib/queryKeys.js`, `frontend/src/App.jsx` | User-scoped roots (`machines`, `sets`, `soreness`) are cancelled+removed on sign-out; keys are user-partitioned so follow-up sign-in gets a distinct cache namespace. |
| Live backend parity smoke (full auth + CRUD execution against Supabase). | blocked | N/A | This environment does not include runnable Supabase credentials/session fixtures for end-to-end auth + data mutation execution. |
| Frontend build sanity. | blocked | `frontend/package.json` | `npm run build` is not validated in this environment because the command currently fails with `sh: 1: vite: not found`; this parity check remains blocked until build tooling is installed/available. |

## Execution notes
- Validation used code-path inspection plus compile-time sanity checks.
- For full production confidence, run a credentialed E2E smoke (login, set logging, machine create/edit/delete, sign-out/sign-in as second user) in staging.
