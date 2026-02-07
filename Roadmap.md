Roadmap (Phased)
Phase 0 — Immediate UX & Reliability Fixes (P0)
Goal: Resolve the three known issues and reduce user confusion during capture/identify.

Split camera vs gallery upload (Issue 1).

Why: The current single file input uses both capture="environment" and multiple, which breaks multi-select and gallery access on many mobile browsers. This maps directly to the current input element on the Camera screen.

Acceptance: Two explicit buttons (“Take Photo” + “Gallery”) with a shared handler, plus a visible 0/3 counter.

Expose real error messages for identify failures (Issue 2).

Why: The current UI shows a single generic error (“Could not identify…”) for any failure, which masks CORS, timeout, or server errors. This behavior is in CameraScreen.analyze (catch block).

Acceptance: Show actionable error text (backend unreachable vs server error vs validation issue) sourced from the thrown errors in the API wrapper.

FileReader error handling + validation (Issue 3).

Why: The current file handling uses a one-shot promise without handling FileReader.onerror or guarding against empty results, which can silently corrupt the image list.

Acceptance: On read failure or empty base64 payload, show a user-visible error and skip the file; reset input value after selection.

Phase 1 — Debugging & Support (P1)
Goal: Make it possible to debug problems on a phone without devtools.

Add an in-app “Diagnostics” screen (debug-on-phone request).

Proposed UI: A simple “Diagnostics” page reachable from the home screen (or a hidden long-press on the title).

Includes:

API base URL and current auth state.

Recent app logs (client-side log buffer).

Health check button to ping /api/health.

“Copy logs” or “Share logs” button (clipboard).

Why this fits current structure: The app already switches between screens via a screen state and uses TopBar + shared layout; a diagnostics screen can follow the same pattern used by History/Summary/Camera screens.

Lightweight request tracing in the UI.

Why: The identifyMachine call is a critical flow. Right now, error context is hidden in the UI and only visible in console logs (if any).

Acceptance: Add structured logs for request start/finish, response status, and error message; pipe them into the diagnostics view.

Phase 2 — Stability & Performance (P2)
Goal: Reduce avoidable runtime errors, simplify maintenance, and prevent slow renders as data grows.

Consolidate machine lookups.

Why: Multiple machines.find(...) calls in render paths can become expensive as data scales (e.g., for sets and soreness). This is visible in multiple render loops now.

Acceptance: Create a memoized machinesById map to speed lookups.

Split App.jsx into screen components.

Why: The file is ~1000 lines and contains all screens and shared components, which slows iteration and complicates debugging. Refactoring into components/ and screens/ makes issues easier to isolate.

Phase 3 — Hardening & Observability (P3)
Goal: Improve reliability at scale and make production debugging easier.

Network error taxonomy.

Why: The API layer throws “Identify failed: <text>” with raw body contents, but the UI currently doesn’t parse or classify errors. Standardizing failure modes (timeout, non-2xx, invalid JSON) makes error messaging and logging consistent.

Backend request logging & health checks surfaced in UI.

Why: A /api/health endpoint exists, and surfacing it in Diagnostics could quickly confirm environment connectivity (auth + CORS + server status).

Issue-to-Roadmap Mapping (explicit)
Issue 1 (mobile upload broken): Phase 0, Item 1 — split camera vs gallery inputs; add 0/3 counter to match the described fix.

Issue 2 (silent API failures): Phase 0, Item 2 — surface concrete error messages from API wrapper instead of generic “Could not identify.”

Issue 3 (FileReader error swallowing): Phase 0, Item 3 — add FileReader error handling and base64 validation; reset input after selection.

Suggested Debug-on-Phone Flow (Detailed)
Add a Diagnostics entry point (Home screen button or hidden gesture).

Display:

VITE_API_URL and whether supabase.auth.getSession() succeeds.

Last 20 log entries (timestamped).

“Ping API health” button (/api/health) with status output.

Export:

“Copy logs” button to clipboard for support sharing.

UX parity: Use the same TopBar and layout patterns as History and Camera screens for a consistent feel.

