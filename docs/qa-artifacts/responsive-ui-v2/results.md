# Responsive UI v2 QA Results Template

> Fill this table after running `npm run qa:responsive-ui-v2` from `frontend/`.
> Status values: `pass`, `fail`, `needs-review`, `not-run`.

| Checklist item | Status | Screenshot path(s) | Notes |
| --- | --- | --- | --- |
| Shell / Navigation: Bottom nav appears only on phone and does not overlap tappable content. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png` | |
| Shell / Navigation: Rail nav appears on tablet widths with stable spacing and no clipped labels. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/tablet.png` | |
| Shell / Navigation: Top nav appears on desktop widths with centered content container. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/desktop.png` | |
| Shell / Navigation: Overflow/More menu opens in expected direction per nav position. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png` | Capture additional menu-open screenshot if needed. |
| Shell / Navigation: Keyboard nav works in primary nav (arrow keys, Home/End). | not-run | `docs/qa-artifacts/responsive-ui-v2/home/desktop.png` | Note manual keyboard verification steps. |
| Home: Hero/action cards scale without text truncation at all widths. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png`, `.../home/tablet.png`, `.../home/desktop.png` | |
| Home: Dashboard cards maintain readable typography and spacing. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/desktop.png` | |
| Home: CTA buttons remain minimum touch size on phone. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png` | |
| Home: No horizontal scrolling at any viewport. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png`, `.../home/tablet.png`, `.../home/desktop.png` | |
| Library: Grid density adapts from single-column to multi-column layouts. | not-run | `docs/qa-artifacts/responsive-ui-v2/library/phone.png`, `.../library/tablet.png`, `.../library/desktop.png` | |
| Library: Machine cards keep image/metadata visible and legible. | not-run | `docs/qa-artifacts/responsive-ui-v2/library/tablet.png` | |
| Library: Card actions remain reachable without overlap. | not-run | `docs/qa-artifacts/responsive-ui-v2/library/phone.png` | |
| Library: Empty/loading states stay centered and balanced. | not-run | `docs/qa-artifacts/responsive-ui-v2/library/phone.png` | |
| History / Plans: Session/plan cards reflow without clipped timestamps or badges. | not-run | `docs/qa-artifacts/responsive-ui-v2/history/phone.png`, `.../plans/phone.png` | |
| History / Plans: Multi-row chips/tags wrap cleanly. | not-run | `docs/qa-artifacts/responsive-ui-v2/history/tablet.png`, `.../plans/tablet.png` | |
| History / Plans: Sticky/anchored controls do not obscure content. | not-run | `docs/qa-artifacts/responsive-ui-v2/history/desktop.png`, `.../plans/desktop.png` | |
| Analysis: Chart/media regions maintain aspect and remain visible at all widths. | not-run | `docs/qa-artifacts/responsive-ui-v2/analysis/phone.png`, `.../analysis/tablet.png`, `.../analysis/desktop.png` | |
| Analysis: Metric cards and tabs wrap/reflow without collision. | not-run | `docs/qa-artifacts/responsive-ui-v2/analysis/tablet.png` | |
| Analysis: Long labels/values remain readable and do not overflow card bounds. | not-run | `docs/qa-artifacts/responsive-ui-v2/analysis/desktop.png` | |
| Cross-cutting: Card paddings, radii, and spacing are consistent from phone to desktop. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png`, `.../home/desktop.png` | |
| Cross-cutting: Thumbnails/illustrations remain visible and unobstructed. | not-run | `docs/qa-artifacts/responsive-ui-v2/library/phone.png`, `.../analysis/desktop.png` | |
| Cross-cutting: Safe-area insets are respected around edge controls. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/phone.png` | Validate on real device/simulator when possible. |
| Cross-cutting: Legacy layout-specific branches removed only after parity validation. | not-run | `docs/qa-artifacts/responsive-ui-v2/home/desktop.png` | Link code review/PR evidence. |
