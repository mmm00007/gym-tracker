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
