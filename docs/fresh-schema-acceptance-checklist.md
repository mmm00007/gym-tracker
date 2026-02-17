# Fresh-Schema Acceptance Checklist (No Migration / No Backfill)

This checklist is for **empty-database rollouts only**.

## Scope guardrails
- [x] No migration scripts required for rollout.
- [x] No backfill jobs/tasks required for rollout.
- [x] Rollback path is feature-flag disablement only (no DB rollback).

## Feature-flag gating (independent disablement)
- [x] `machineRatingEnabled` gates rating input, card display, quick-rate actions, and rating-based sort priority.
- [x] `pinnedFavoritesEnabled` gates favorite toggle actions, favorite icon display, and favorite-based sort priority.
- [x] `machineAutofillEnabled` gates the photo autofill panel and keeps manual entry fully available.
- [x] `weightedMuscleProfileWorkloadEnabled` gates weighted profile contribution for dashboard workload (fallback = even split across tagged muscle groups).
- [x] `fixedOptionMachineTaxonomyEnabled` gates fixed movement/muscle option UX; disabled mode allows manual movement + comma-separated muscle groups.

## Cold-start validation (fresh schema only)
- [ ] Recreate DB from `supabase_schema.sql` in a clean environment.
- [ ] Verify app boot from empty DB.
- [ ] Verify auth sign-in/sign-up from empty DB.
- [ ] Verify initial data loading with no user rows.
- [ ] Verify create/edit/delete machine flows against the fresh schema.

## Target-state behavior checks
### Library cards + machine signals
- [ ] Rating can be set in edit form, displayed on card, and participates in sorting when enabled.
- [ ] Favorite can be toggled in edit form/card action, icon state persists, and favorite ordering applies when enabled.
- [ ] With each flag disabled (`machineRatingEnabled` / `pinnedFavoritesEnabled`), corresponding controls are hidden and core library flow still works.

### AI autofill
- [ ] Autofill button is visible only when `machineAutofillEnabled=true`.
- [ ] Success path shows suggestion confirmation and applies suggested fields only after explicit user action.
- [ ] Failure path shows inline error and manual save remains available.
- [ ] Structured log emitted on failure: `identify.autofill_failed`.

### Muscle targeting + validation
- [ ] Fixed taxonomy mode enforces movement pattern selection and primary muscle selection.
- [ ] Secondary muscle percentages are limited to 1–99 with validation feedback.
- [ ] Manual taxonomy mode accepts movement text + comma-separated muscle groups and rejects unknown groups.

### Dashboard workload scope
- [ ] Workload widget scope switch only uses current week/current month windows.
- [ ] Weighted profile mode uses primary=100 and secondary=% contribution weights.
- [ ] Disabled weighted mode uses even split across resolved muscle groups.

## Failure/edge-case expectations
- [ ] Favorites load failure falls back to default ordering and logs `favorites.load_failed` with window metadata.
- [ ] Dashboard metric compute failure logs `dashboard.metrics.*_failed` and widget degrades safely.
- [ ] Feature flag load failure falls back to safe defaults and logs `feature_flags.load_failed`.
- [ ] Disabling any single new flag does not block machine CRUD/auth/navigation base flows.
