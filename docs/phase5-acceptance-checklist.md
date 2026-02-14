# Phase 5 Acceptance Checklist

This checklist maps directly to the **Roadmap Phase 5** bullets.

## 1) Plan CRUD UI (`plans`, `plan_days`, `plan_items`)
- [ ] Plans screen is reachable from Home only when `plansEnabled=true`.
- [ ] Create/update/delete Plan works and failures are surfaced in UI.
- [ ] Create/update/delete Plan Day works and failures are surfaced in UI.
- [ ] Create/update/delete Plan Item works and failures are surfaced in UI.
- [ ] Structured log events emitted on failures (`plan.crud.*_failed`) with useful `meta`.

## 2) Optional logging integration (non-blocking planned suggestions)
- [ ] Log screen shows “Planned today” suggestions when data exists.
- [ ] Logging still works when suggestions load fails (non-blocking behavior).
- [ ] Structured warning log emitted when suggestions query fails.

## 3) Favorites ordering (30d/90d/all switch)
- [ ] Favorites ordering behavior is gated by `favoritesOrderingEnabled`.
- [ ] When enabled: exercise list can switch ordering window (`30d`, `90d`, `all`).
- [ ] When disabled: list falls back to default ordering with no favorites window controls.
- [ ] Structured warning log emitted on favorites query failure, including selected window in `meta`.

## 4) Home dashboard visuals + formula tooltips
- [ ] Dashboard card visibility is gated by `homeDashboardEnabled`.
- [ ] Dashboard includes:
  - [ ] muscle-group workload
  - [ ] weekly consistency
  - [ ] workload distribution balance
- [ ] Tooltip formulas render for each dashboard metric card.
- [ ] Structured error logs emitted if metric computation fails (`dashboard.metrics.*_failed`).

---

## Manual verification script

### A. Plan CRUD flow
1. Open **Home**.
2. Confirm **Plans** CTA is visible only with `plansEnabled=true`.
3. Open **Plans** and:
   - create a plan,
   - edit name/goal,
   - add a weekday template,
   - add/edit/delete a plan item,
   - delete the day and plan.
4. Confirm optimistic updates + rollback behavior on simulated failures.
5. Confirm diagnostics logs include structured `plan.crud.*_failed` events when failures occur.

### B. Non-blocking planned suggestions
1. Open **Log Sets**.
2. Verify “Planned today” block can load and show items.
3. Simulate `getTodayPlanSuggestions` failure (network/API failure).
4. Verify logging a set still works without blocker.
5. Verify warning log `plan_suggestions.load_failed` is captured.

### C. Favorites window switch behavior
1. Open **Log Sets → Select Exercise**.
2. With `favoritesOrderingEnabled=true`, switch `30d` → `90d` → `all`.
3. Verify list ordering and usage badges update per selected window.
4. With `favoritesOrderingEnabled=false`, verify window controls are hidden and default ordering is used.
5. Simulate favorites query failure and verify `favorites.load_failed` includes `meta.window`.

### D. Tooltip formula correctness
1. Open **Home** with `homeDashboardEnabled=true`.
2. Hover each info tooltip in dashboard cards.
3. Verify text matches formulas for:
   - workload split by muscle groups,
   - weekly consistency denominator (`6 × 7`),
   - balance index (Shannon evenness).
4. Cross-check a small known sample manually to confirm displayed percentages are formula-consistent.
