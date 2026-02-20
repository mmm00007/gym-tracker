# Router Phase 2 Route Plan

This plan records the path-to-screen mapping introduced for the TanStack Router phase so the `activeScreen` migration remains auditable.

## Route map

| Route ID | Navigation label | `activeScreen` key | Path | Notes |
| --- | --- | --- | --- | --- |
| `home` | Home | `home` | `/` | Default landing screen. |
| `log` | Log | `log` | `/log` | Existing logging view. |
| `library` | Library | `library` | `/library` | Feature-flag guarded (`libraryScreenEnabled`). Disabled state falls back to home. |
| `history` | History | `history` | `/history` | Existing history view. |
| `analysis` | Analysis | `analysis` | `/analysis` | Existing analysis view. |
| `plans` | Plans | `plans` | `/plans` | Feature-flag guarded (`plansEnabled`). Disabled state falls back to home. |
| `diagnostics` | Diagnostics | `diagnostics` | `/diagnostics` | Diagnostics-only screen (primary nav hidden). |

## Fallback parity requirements

- When `libraryScreenEnabled` is false and the user lands on `/library`, the app logs `feature_flags.library_fallback` and navigates to `/`.
- When `plansEnabled` is false and the user lands on `/plans`, the app logs `feature_flags.plans_fallback` and navigates to `/`.
- These match the current `App.jsx` behavior used before route-based screen selection.
