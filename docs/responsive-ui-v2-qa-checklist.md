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

## Checklist (completed)

### 1) Shell / Navigation
- [x] **FAIL** — Bottom-navigation behavior on authenticated app shell could not be validated because QA run was blocked at auth (`Failed to fetch` from Supabase auth). Artifact: [phone capture](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png).
- [x] **FAIL** — Rail navigation on tablet could not be validated because primary navigation never rendered past sign-in. Artifact: [tablet capture](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/tablet.png).
- [x] **FAIL** — Desktop top navigation/container alignment could not be validated because test session remained on auth screen. Artifact: [desktop capture](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png).
- [x] **FAIL** — Overflow/More menu direction could not be validated on shell navigation because shell nav never rendered. Artifact: [desktop menu attempt capture](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop-menu-open.png).
- [x] **FAIL** — Keyboard navigation in primary nav (arrow/Home/End) could not be validated because primary nav was unavailable in blocked auth state. Artifact: [keyboard attempt capture](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop-keyboard-nav.png).

### 2) Home
- [x] **FAIL** — Home hero/action card scaling at all widths could not be validated because Home screen did not load post-auth. Artifact: [phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png), [tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/tablet.png), [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png).
- [x] **FAIL** — Dashboard-card typography/spacing could not be validated due blocked auth state. Artifact: [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png).
- [x] **FAIL** — Phone CTA touch-target validation could not be completed because CTA under test (home actions) was not reachable. Artifact: [phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png).
- [x] **FAIL** — Horizontal-scroll validation for Home at all viewports could not be completed because intended content was inaccessible. Artifact: [phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png), [tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/tablet.png), [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png).

### 3) Library / Machine grids
- [x] **FAIL** — Grid-density adaptation could not be validated because Library screen navigation requires successful auth/session. Artifact: [phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/phone.png), [tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/tablet.png), [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/desktop.png).
- [x] **FAIL** — Machine-card media/metadata legibility could not be validated (screen blocked pre-render). Artifact: [tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/tablet.png).
- [x] **FAIL** — Card action reachability/overlap could not be validated because interactive cards were not accessible. Artifact: [phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/phone.png).
- [x] **FAIL** — Empty/loading-state centering for Library could not be validated because the Library content state was never entered. Artifact: [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/desktop.png).

### 4) History / Plans
- [x] **FAIL** — Session/plan card reflow with timestamps/badges could not be validated due auth blockage. Artifact: [history phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/history/phone.png), [plans phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/plans/phone.png).
- [x] **FAIL** — Multi-row chip/tag wrapping could not be validated because History/Plans content was unavailable. Artifact: [history tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/history/tablet.png), [plans tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/plans/tablet.png).
- [x] **FAIL** — Sticky/anchored control overlap could not be validated due inability to render target screens. Artifact: [history desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/history/desktop.png), [plans desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/plans/desktop.png).

### 5) Analysis
- [x] **FAIL** — Chart/media region aspect and visibility could not be validated because Analysis screen remained inaccessible. Artifact: [phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/analysis/phone.png), [tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/analysis/tablet.png), [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/analysis/desktop.png).
- [x] **FAIL** — Metric card/tab wrapping could not be validated because Analysis modules did not load. Artifact: [tablet](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/analysis/tablet.png).
- [x] **FAIL** — Long label/value overflow checks could not be validated because Analysis cards were not reachable. Artifact: [desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/analysis/desktop.png).

## Cross-cutting checks
- [x] **FAIL** — Card scaling consistency (phone→desktop) could not be validated for post-auth app cards. Artifact: [home phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png), [home desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png).
- [x] **FAIL** — Image/thumbnail visibility in app content could not be validated because content screens did not render. Artifact: [library desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/library/desktop.png), [analysis desktop](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/analysis/desktop.png).
- [x] **FAIL** — Safe-area handling around edge controls in authenticated shell could not be validated due blocked app shell state. Artifact: [home phone](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/phone.png).
- [x] **FAIL** — Legacy branch removal parity gate cannot be confirmed until responsive parity is validated in an environment with working auth/backend. Artifact: [desktop run evidence](browser:/tmp/codex_browser_invocations/fc199fa9bd70fea7/artifacts/docs/qa-artifacts/responsive-ui-v2/home/desktop.png).

## Execution note
- QA harness reached auth UI but could not authenticate due backend connectivity (`Failed to fetch` on sign-in); therefore all post-auth checklist items are blocked in this run.
