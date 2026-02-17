# Fresh-Schema Rollout QA Results

Status legend:
- `pass`: validated in this run
- `fail`: validated and failing
- `blocked`: cannot validate in this environment

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Feature flag wiring includes all rollout flags in backend and frontend defaults/env parsing. | pass | `backend/main.py`, `frontend/src/lib/featureFlags.js` | All five requested features are independently represented as flags. |
| Machine rating gating (form/card/sort) | pass | `frontend/src/App.jsx`, `frontend/src/components/machines/MachineCard.jsx` | Controls and sort participation are conditioned on `machineRatingEnabled`. |
| Pinned favorites gating (toggle/icon/sort) | pass | `frontend/src/App.jsx`, `frontend/src/components/machines/MachineCard.jsx` | Controls and sort participation are conditioned on `pinnedFavoritesEnabled`. |
| Machine autofill optional path + failure logging | pass | `frontend/src/App.jsx` | Autofill panel is flag-gated; `identify.autofill_failed` remains on failure path. |
| Weighted muscle-profile workload flag + fallback behavior | pass | `frontend/src/lib/dashboardMetrics.js`, `frontend/src/App.jsx` | Uses weighted profile when enabled; even split fallback when disabled. |
| Fixed-option taxonomy flag with manual fallback mode | pass | `frontend/src/App.jsx` | Fixed selection UI is flag-gated; manual movement/muscle entry path available when disabled. |
| Fresh DB recreation from `supabase_schema.sql` | blocked | N/A | No local Postgres/Supabase CLI available in this execution environment. |
| Empty-db auth + data-load + machine CRUD smoke | blocked | N/A | Requires a running clean database + valid Supabase auth configuration. |
| Screenshot capture attempt for key visual states | blocked | `browser:/tmp/codex_browser_invocations/3b7e57dce9bfd257/artifacts/artifacts/fresh-rollout-auth-state.png` | App loaded auth gate only; authenticated library/workload states were not reachable without test credentials. |
| Frontend compile check | pass | `npm run build` | Build completed successfully. |
| Backend syntax check | pass | `python -m py_compile backend/main.py` | Python module compiles cleanly. |

## Rollout sequence + rollback readiness
1. Deploy backend/frontend with all new flags defaulted to `false` in remote flag config.
2. Enable `fixedOptionMachineTaxonomyEnabled` first and validate manual + fixed mode toggling.
3. Enable `machineRatingEnabled` and `pinnedFavoritesEnabled` next (independent toggles).
4. Enable `machineAutofillEnabled` after API quota/latency validation.
5. Enable `weightedMuscleProfileWorkloadEnabled` last and compare dashboard trend outputs.

Rollback action for any issue: **disable only the impacted flag(s)**. No DB rollback required.
