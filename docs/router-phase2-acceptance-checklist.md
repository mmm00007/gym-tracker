# Router Phase 2 Acceptance Checklist

Use this checklist to confirm route-module behavior matches current production behavior before deleting legacy screen-based navigation code.

## Scope and parity goal

- Validate parity for all router-managed pages and transitions.
- Capture regressions before removing old screen-based App state.
- Run these checks with feature flags both on and off where applicable.

## A) Core route parity checks

| Area | Manual verification steps | Expected result | Status |
| --- | --- | --- | --- |
| Direct URL load for each route | Load each route directly in a fresh tab (e.g. `/`, `/history`, `/analysis`, `/diagnostics`, and any additional Phase 2 route paths) while authenticated and unauthenticated as applicable. | Correct route renders without fallback-to-wrong-screen behavior; auth-gated routes redirect consistently. | ⬜ |
| Browser back/forward behavior | Navigate across multiple routes, then use browser back and forward repeatedly (including after refresh). | History stack behavior matches expected browser semantics; no stale view, blank page, or wrong route render. | ⬜ |
| Feature-flag redirects | Toggle relevant feature flags and load guarded URLs directly and via in-app nav. | Redirect target is deterministic and matches current behavior for disabled/hidden routes. | ⬜ |
| Auth transitions | While on a deep route, sign out/sign in, then navigate again; also open guarded route while signed out. | Router applies auth guards correctly and lands user on expected route after auth changes. | ⬜ |
| Navigation highlight correctness | Visit each route via nav and via direct URL, then confirm active nav item. | Active/selected nav state always corresponds to current route path. | ⬜ |
| No data-loading regressions | Compare network/query behavior on migrated routes against baseline flows (load, refocus, mutation). | No duplicate fetch loops, missing data, or stale data compared with pre-router behavior. | ⬜ |

## B) Deep-link manual QA cases

### 1) History deep-link

- Open `/history` directly in a new tab while signed in.
- Refresh the page.
- Use browser back/forward to leave and return.
- Verify data panels/charts/list render as expected and nav highlight stays on History.

**Expected:** History route is stable across load/refresh/back-forward with correct data and active-nav state.

### 2) Analysis deep-link

- Open `/analysis` directly in a new tab while signed in.
- Refresh the page.
- Trigger any available filter/time-range interactions.
- Use browser back/forward to validate URL/state restoration.

**Expected:** Analysis route loads directly, interactions persist correctly per URL/state model, and no extra regressions appear.

### 3) Diagnostics deep-link

- Open `/diagnostics` directly in a new tab while signed in.
- Refresh the page.
- Sign out and confirm guard/redirect behavior.
- Sign back in and return to `/diagnostics`.

**Expected:** Diagnostics route respects auth transitions and returns to expected route behavior without stale screen-state artifacts.

## C) Legacy screen-state removal verification (must pass before deleting old code)

- [ ] `App.jsx` contains no `screen` state variable.
- [ ] `App.jsx` contains no `navigateToScreen` function.
- [ ] Navigation flow is fully route-driven (URL + router state), with no hidden screen switch fallback.

## D) Sign-off

- QA owner:
- Date:
- Build/commit tested:
- Notes / follow-ups:
