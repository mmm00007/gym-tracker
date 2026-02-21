# App extraction tracker (pre-refactor freeze)

This tracker locks in current behavior before moving logic out of `frontend/src/App.jsx`.

## Current `App.jsx` responsibilities

`App.jsx` currently acts as a composition root and route shell for multiple concerns that will later be extracted:

1. **Auth/session composition**
   - Wires authentication/session-aware data hooks and mutations.
   - Handles auth transition flows that influence route access and data refresh behavior.
2. **Navigation shell**
   - Hosts app-level layout primitives and shared navigation interactions around routed content.
   - Coordinates route-aware UI state (e.g., active navigation behavior).
3. **Route context shaping**
   - Provides route-level context via `AppRouteContextProvider` for child route modules.
   - Shapes/bridges app state and callbacks consumed by routed screens.
4. **Modals and overlays**
   - Coordinates modal/overlay visibility and interaction points that span multiple routes.
5. **Rest timer wiring**
   - Wires global rest timer behavior (`useRestTimer`) so timer state/controls remain consistent across route transitions.
6. **Route-specific derived state**
   - Computes and passes route-consumed derived values for feature views (history/analysis/diagnostics and related flows).

## Must-not-regress behavior baseline

The following behavior set is frozen during extraction work and must remain parity-equivalent:

- Direct URL loading for each route resolves to the correct screen with expected auth guarding.
- Browser back/forward semantics remain stable after multi-route navigation and refresh.
- Feature-flagged redirect behavior remains deterministic.
- Auth sign-in/sign-out transitions preserve route guard outcomes and expected landing routes.
- Active navigation highlight always matches current route path.
- Data-loading behavior avoids duplicate loops, stale views, and missing data compared to baseline.
- Deep-link behavior for `/history`, `/analysis`, and `/diagnostics` remains stable across refresh and auth transitions.
- Legacy-screen-state removal checks must all pass before deleting fallback screen-switch logic.

## Required signoff artifact

- **Router parity checklist (required):** [`docs/router-phase2-acceptance-checklist.md`](./router-phase2-acceptance-checklist.md)
- Ownership/date signoff must be completed in Section D of that checklist before merge of extraction PRs.
