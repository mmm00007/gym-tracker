# TanStack Query Conventions for Phase 2 (Router Migration)

This document defines the query/mutation conventions to keep data behavior consistent while screens move to Router-based route modules.

## Router readiness gate (pre-TanStack Router)

Validated on this branch before starting Router work.

| Checklist item | Status | Validation notes |
| --- | --- | --- |
| no `loadData` function remains | ✅ Pass | `rg -n "\bloadData\b"` returns no matches in repo. |
| no local mirror state for query-backed entities | ❌ Fail | `DiagnosticsScreen` keeps local auth session mirror state via `authInfo`/`setAuthInfo` and a direct `getSession()` effect, while auth is already query-backed elsewhere. |
| no inline `useQueries` in `App.jsx` | ✅ Pass | `useQueries` exists only in `frontend/src/features/data/hooks/useMachineHistoryQueries.js`; no matches in `frontend/src/App.jsx`. |
| no raw query key literals | ✅ Pass | `rg -n "queryKey\s*:\s*\[" frontend/src` finds no literal query keys in query definitions; keys are sourced from `queryKeys`. |
| auth and feature flags are query-driven | ✅ Pass | App data composition uses `useCurrentUserQuery` and `useFeatureFlagsQuery` via `useAppData`, then consumes those query objects in `App.jsx`. |

**Gate outcome:** not yet fully ready for Router migration. Resolve the diagnostics auth mirror state first so all checklist items pass.

## 1) Query-key policy

- Keep keys centralized in `frontend/src/lib/queryKeys.js`.
- Every user-scoped key must include a resolved user identifier segment.
- Root segments for user data must stay explicit (`machines`, `sets`, `soreness`) so cache-clear predicates remain simple and auditable.
- Route loaders/components must not inline ad-hoc array keys for existing resources.

## 2) Query defaults and behavior

- Use `withQueryDefaults` from `frontend/src/lib/queryDefaults.js` for all new `useQuery` calls.
- Preserve baseline behavior unless a route has a specific requirement:
  - `retry: 1`
  - `refetchOnWindowFocus: false`
  - shared `gcTime`
- Tune `staleTime` per resource profile (examples already defined for auth, machines, sets, soreness, feature flags).

## 3) Auth and cache isolation rules

- The auth state listener is responsible for cache isolation events.
- On `SIGNED_OUT` (or null session), call `clearUserScopedQueryCache(queryClient)`.
- Keep `isUserScopedQueryKey` aligned with query-key roots whenever a new user-owned resource is added.
- Never reuse previous-user data as placeholder/initial data for another user context.

## 4) Route migration rules (Phase 2)

- Co-locate route data needs behind feature hooks in `frontend/src/features/data/hooks/` instead of embedding queryFns directly in route files.
- Prefer one canonical hook per resource + operation:
  - `useMachinesQuery`, `useSetsQuery`, `useRecentSorenessQuery`, `usePendingSorenessQuery`
  - mutation hooks for log/delete set and machine CRUD
- Keep side effects out of queryFns (queryFns fetch/normalize only).
- Perform view-state projection in `useMemo`/component code, not by mutating cached query data.

## 5) Mutation and invalidation rules

- Mutations must invalidate the minimum affected key set:
  - log set: `sets.list(userId)`, `soreness.pending(userId)`
  - delete set: `sets.list(userId)`, `soreness.pending(userId)`
  - upsert/delete machine: `machines.list(userId)`
  - submit soreness: `soreness.pending(userId)`, `soreness.recent(userId)`
- Keep machine-history invalidation explicit where history depends on derived set data.
- Use mutation `meta.operationName` for observability where available.

## 6) Duplicate-request prevention checklist

For each migrated route, verify:
1. Query `enabled` flags are gated by auth and required prerequisites.
2. Multiple components use the same canonical key for the same resource.
3. No parallel `useEffect` fetch duplicates an existing query.
4. No unconditional `refetch()` on mount.

## 7) Phase 2 definition of done (data layer)

A migrated route is considered complete only if:
- it uses canonical query keys/defaults,
- user-scoped cache is isolated across auth transitions,
- mutations invalidate relevant keys,
- no duplicate mount fetches are introduced,
- existing parity flows remain intact.
