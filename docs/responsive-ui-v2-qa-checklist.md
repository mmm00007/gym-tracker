# Responsive UI v2 Rollout QA Checklist

This checklist is for **layout/UX verification only**.
There is **no user-data migration scope** in this rollout.

Representative viewport matrix used for visual QA:
- Phone: **360 × 800**
- Tablet: **768 × 1024**
- Desktop/monitor: **1440 × 900** (or wider)

## Screen rollout order
1. Shell / Navigation
2. Home
3. Library / Machine grids
4. History / Plans
5. Analysis

## Checklist

### 1) Shell / Navigation
- [ ] Bottom navigation appears only on phone widths and does not overlap tappable content.
- [ ] Rail navigation appears on tablet widths with stable spacing and no clipped labels.
- [ ] Top navigation appears on desktop widths with centered content container.
- [ ] Overflow/More menu opens in the expected direction per nav position.
- [ ] Keyboard nav works in primary nav (arrow keys, Home/End) across layouts.

### 2) Home
- [ ] Hero and action cards scale without text truncation at all three widths.
- [ ] Dashboard cards maintain readable typography and spacing.
- [ ] CTA buttons remain minimum touch size on phone.
- [ ] No horizontal scrolling at any viewport.

### 3) Library / Machine grids
- [ ] Grid density adapts from single-column (phone) to multi-column (tablet/desktop).
- [ ] Machine cards keep image/metadata visible and legible.
- [ ] Card actions remain reachable without overlap.
- [ ] Empty/loading states stay centered and balanced.

### 4) History / Plans
- [ ] Session/plan cards reflow without clipped timestamps or badges.
- [ ] Multi-row chips/tags wrap cleanly.
- [ ] Sticky/anchored controls (if present) do not obscure content.

### 5) Analysis
- [ ] Chart/media regions maintain aspect and remain visible at all widths.
- [ ] Metric cards and tabs wrap/reflow without collision.
- [ ] Long labels/values remain readable and do not overflow card bounds.

## Cross-cutting checks
- [ ] **Card scaling:** card paddings, border radii, and spacing feel consistent from phone → desktop.
- [ ] **Image visibility:** thumbnails/illustrations remain visible, uncropped (unless intentionally cropped), and not hidden behind overlays.
- [ ] **Safe-area handling:** iOS/Android safe-area insets are respected at top/bottom, especially around bottom nav and edge controls.
- [ ] **Legacy branch removal:** confirm old layout-specific branches are removed only after parity is validated.

## Current run status (2026-02-17)

- Outcome: **Blocked / Invalid QA run** (environment auth dependency unavailable).
- Blocking symptom: sign-in returned `Failed to fetch`, so authenticated screens could not be reached.
- Evidence captures from blocked run:
  - Phone: [home/auth screen](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png)
  - Tablet: [home/auth screen](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/tablet.png)
  - Desktop: [home/auth screen](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png)
- Reviewer note addressed: this checklist is intentionally left un-checked until a valid authenticated QA run can be executed.

## Automated screenshot harness (rerunnable)

Use the automation harness to capture baseline screenshots for the five primary screens in all required viewports.

### Output contract
Screenshots are saved deterministically to:

- `docs/qa-artifacts/responsive-ui-v2/home/{phone|tablet|desktop}.png`
- `docs/qa-artifacts/responsive-ui-v2/library/{phone|tablet|desktop}.png`
- `docs/qa-artifacts/responsive-ui-v2/history/{phone|tablet|desktop}.png`
- `docs/qa-artifacts/responsive-ui-v2/plans/{phone|tablet|desktop}.png`
- `docs/qa-artifacts/responsive-ui-v2/analysis/{phone|tablet|desktop}.png`

Viewport mapping used by the script:
- `phone` → `360x800`
- `tablet` → `768x1024`
- `desktop` → `1440x900`

### Prerequisites
1. Start the frontend app (or any deployed build URL) so it is reachable from the harness.
2. Ensure a valid user account exists for the environment under test.
3. Install Playwright if not already available:
   - `cd frontend && npm install --save-dev playwright`
4. Export QA credentials used by `AuthScreen` in `App.jsx`:
   - `export QA_USERNAME="<username>"`
   - `export QA_PASSWORD="<password>"`

Optional:
- `export QA_BASE_URL="http://127.0.0.1:4173"` (defaults to this value)

### Run commands
From repository root:

```bash
cd frontend
npm run dev
```

In another terminal:

```bash
cd frontend
QA_BASE_URL="http://127.0.0.1:5173" QA_USERNAME="<username>" QA_PASSWORD="<password>" npm run qa:responsive-ui-v2
```

### Result logging
- Record pass/fail notes in `docs/qa-artifacts/responsive-ui-v2/results.md`.
- If a checklist item requires a special state (e.g. overflow menu open), capture an additional screenshot and reference that path in the notes column.
