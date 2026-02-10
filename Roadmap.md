# Improvements

1) Session-centric model creates UI/data friction
Description : the current app is built around sessions, but your target model is set-first logging with flexible grouping. Session lifecycle adds unnecessary workflow overhead.
Task : Refactor frontend and backend flows so set logging does not require an active session lifecycle. Introduce grouping logic based on timestamps (training day boundary and/or gap-based clustering) for analysis/history instead of hard session records.

2) sets table is tightly coupled to sessions
Description : sets.session_id is required today and RLS relies on session ownership, which blocks session removal.
Task : Update schema to support direct set ownership (e.g., `sets.user_id`) and adapt RLS policies to authorize sets by user. Keep backward compatibility during migration by allowing transitional reads/writes while phasing out strict `session_id` dependency.

3) Machine creation/editing happens during logging
Description : Creating/editing machines mid-workout increases cognitive noise and data inconsistency.
Task : Add a top-level Library screen for create/edit/delete operations. In log-set flow, allow only selection of existing entries (plus optional “go to library” shortcut), not inline creation/edit. In the new `LibraryScreen` , add a search input and filter chips for equipment type and muscle groups. Reuse existing `MachineCard` display and `muscle_groups` filtering logic from `SessionScreen`.

4) Treat machine data as a knowledge base
Description : Machine metadata should be curated and stable, not treated as ad hoc workout context.
Task : Define canonical metadata fields (movement, muscle groups, equipment type, notes, media, source) and establish editing patterns oriented around curation and consistency, not in-session convenience.

5) Freeweights are not first-class today
Description : Current taxonomy is “machine”-biased; freeweights/bodyweight/cable should be equally represented.
Task : Add `equipment_type` to the existing entity (`machine`, `freeweight`, `bodyweight`, `cable`, etc.), backfill existing rows to `machine`, and update UI labels/filters to neutral terms like “exercise/equipment.”

6) Terminology in UI is machine-only
Description : Labels like “Select Machine” don’t fit expanded taxonomy.
Task : Update user-facing labels across selection, edit, history, and analysis views to neutral wording. Keep backward-compatible DB naming if needed during migration.

7) Set duration is modeled but not captured
Description : duration_seconds exists but is usually null because UI does not collect it.
Task : On log-set screen, add optional Start/Stop Set timing controls. If user uses timer, persist `duration_seconds`; if not, keep null (no inference).

8) Do not infer duration when user doesn’t time sets
Description : we explicitly decided against inferred durations for quality reasons.
Task : Ensure analytics logic never imputes missing `duration_seconds`. Treat null duration as unknown, and exclude duration-based metrics where data is absent.

9) Post-log UX should stay in place and be fast
Description : After logging, user should remain on same page/settings and get immediate feedback.
Task : After successful set submission, keep selected exercise and current inputs/sliders intact, show a lightweight success toast/modal, and append the new set to recent sets list immediately.

10) Add set classification (warm-up vs working etc.)
Description : Mixing warm-up and working sets distorts progression and training-load metrics.
Task : Add `set_type` field (`warmup`, `working`, `top`, `drop`...), expose it in log UI with sensible defaults, and update analytics to include/exclude categories as needed.

11) Use training-day boundary instead of workout start/stop
Description : For night owls and post-midnight training, day-boundary logic is better than session markers.
Task : Add per-user preference like `day_start_hour` and compute `training_date` from `logged_at` shifted by that boundary. Use this grouping in dashboard, history, readiness, and trend analysis.

12) Add editable usual sleep/workout windows (secondary)
Description : Useful for personalization and grouping heuristics, but should stay optional.
Task : Extend user preferences with editable typical sleep and workout windows. Use these as optional context signals in analysis and scheduling; do not hard-gate logging.

13) Track favorites by set count per equipment
Description : we want to prioritize frequently used equipment in selection UX.
Task : Create aggregate query/view for set counts by equipment over configurable windows (e.g., 30d, 90d, all-time). Use it to sort/pin favorites in selection screens.

14) AI should be user-controlled, not auto-run
Decription : Automatic analysis at workout end is noisy/costly and removes user intent.
Task : Remove auto-trigger AI from workout completion. Add an Analyze menu where user selects scope/goals and submits analysis on demand.

15) Persist AI reports for later reference
Description : AI outputs should be stored and browsable historically.
Task : Create `analysis_reports` table storing request scope, generated content, metadata, and timestamps. Build UI for viewing/filtering past reports and opening full details.

16) Add weekly scheduled AI trends section
Description : Beyond ad hoc analysis, weekly automated trend summaries were requested.
Task : Add scheduled backend job that runs weekly trend analysis and stores output in reports storage. Add Trends UI section showing latest and previous weekly trend reports.

17) Add citations/evidence to AI reports
Description : AI claims should be explainable with metric evidence and time windows.
Task : Extend AI output schema to include evidence objects (metric, period, delta, source aggregates) and render “why” expandable evidence blocks in report UI.

18) Add workout plan schema
Description : Plans should map weekday/type/muscle groups/equipment and later power adherence analysis.
Task : Add plan tables (plans, plan\_days, plan\_items) supporting weekday templates, workout type, target muscle groups, and linked equipment. Expose CRUD in UI and optional integration into logging workflow.

20) Home dashboard needs clear, simple recent-progress visuals
Description : You requested understandable visuals for progress, consistency, and effort distribution.
Task : Create home visualizations for muscle-group workload, consistency over recent weeks, and distribution balance across muscle groups. Define formulas explicitly in UI tooltips for interpretability.

21) Add data export (necessary)
Description : Export is required for trust/portability and external analysis.
Task : Add export endpoints/UI with date filters for sets, equipment library, readiness/training-day logs, plans, and AI reports. Ensure timezone-safe timestamps and predictable schemas.

22) Support canonical freeweight entries with minimal required data
Description : Freeweights don’t have thumbnails or manufacturer data; forcing those fields adds friction.
Task : In the machine creation/edit UI (`frontend/src/App.jsx` EditMachineScreen), make fields like thumbnails/notes optional when equipment is not a machine and avoid surfacing machine-specific prompts (e.g., “instruction image”) when `equipment_type` is freeweight or bodyweight. Use conditional UI based on equipment type.

23) Add default freeweight catalog seeds
Description : Users shouldn’t have to define “Dumbbell,” “Barbell,” “Kettlebell” every time.
Task : Add a seed routine (e.g., on first app load or account creation) to insert common freeweight entries with basic metadata (movement, muscle groups, default weight/reps). Implement in a backend or client-side bootstrap flow (e.g., in `frontend/src/App.jsx` after auth).

24) AI recommendations and soreness tracking should not be session bound 
Description : Rework recommendations and soreness prompts to use set-based groupings (training day boundary and/or gap-based clustering)
Task : Update `frontend/src/App.jsx` and `frontend/src/lib/api.js` usage so recommendation payloads are built from grouped sets (e.g., per training day boundary or per inferred workout cluster) instead of session objects. In `supabase_schema.sql`, change `soreness_reports.session_id` to reference the new grouping key (or store `bucket_date`/`bucket_id` directly). Update `getPendingSoreness`/`submitSoreness` flows in `frontend/src/lib/supabase.js` to query by the new grouping key.


# Implementation Plan of Above Improvements

Assumption update: there are currently no users and no historical production data to preserve, so this plan uses a **single SQL schema cutover** (no data migration/backfill track).


## Phase 0 — Stabilization baseline (must-do first)
Goal: stop partial session behavior from causing inconsistent UX/data while shipping the schema reset.
    1. Define rollout mode flags (frontend + backend)
    • Add feature flags for:
        ◦ setCentricLogging
        ◦ libraryScreenEnabled
        ◦ analysisOnDemandOnly
    • Reason: current app still has active session UX paths mixed with new grouped paths; flags let us cut over cleanly.
    2. Data contract lock doc
    • Create a single schema/API contract doc for:
        ◦ set logging payload
        ◦ training-day grouping payload
        ◦ analysis report payload with evidence
    • Reason: frontend currently sends grouped keys but flow is still session-structured in places.



## Phase 1 — Data model completion (DB-first, no legacy migration)
1.1 Canonical entity taxonomy (machine vs freeweight vs bodyweight)
Goal: formalize “exercise/equipment” model where freeweight/bodyweight are first-class (not machine aliases).
    1. Rename conceptual model in app layer
    • Keep DB table name machines for now to minimize application churn.
    • Introduce app-level type alias equipment everywhere in frontend + API payload mapping.
    • Reason: semantics need to be neutral even if table names stay as-is.
    2. Harden equipment_type semantics
    • Keep/check enum values:
        ◦ machine, freeweight, bodyweight, cable, etc.
    • Add DB check constraints to disallow machine-only fields when not machine (hard validation immediately).
    • Current schema has equipment_type but no type-specific constraints yet.
    3. Canonical metadata schema
    • Validate fields by equipment type:
        ◦ Required all: name, movement, equipment_type, muscle_groups
        ◦ Optional by type:
            ▪ machine: thumbnails, instruction_image, source, notes
            ▪ freeweight/bodyweight: media optional, no machine prompts
    • Reason: UI currently still machine-centric prompts always shown.
1.2 Set-centric ownership + grouping hardening
    Note: because there are currently no users, this phase is a direct SQL schema update (no backfill or dual-write transition needed).
    1. Ensure training_date/training_bucket_id are always computed
    • Add DB trigger on sets insert/update:
        ◦ derive from logged_at and user_preferences.day_start_hour
    • Reason: current logic depends on backfill/update path but doesn’t enforce on every new row via trigger function.
    2. Introduce optional gap-clustering key
    • Add workout_cluster_id (or deterministic bucket_id) to support same training day multiple clusters.
    • Keep training-day grouping as primary; use gap-cluster as secondary grouping for specific analyses.
    3. Session dependency removal (one-step cutover)
    • Remove strict reliance on session_id from schema/RLS in the same SQL update.
    • Require and enforce sets.user_id ownership + grouped keys for authorization/read paths.
    • Reason: no production data/users means we can do a clean break instead of a phased fallback.
1.3 Soreness and recommendation grouping keys
    1. Finalize soreness schema
    • Make training_bucket_id primary linkage in soreness flows.
    • Drop session-based linkage from soreness flows in this same schema change.
    • Reason: no migration window is required.
    2. Recommendation scope schema
    • Persist explicit scope object:
        ◦ { grouping: "training_day|cluster", date_range, included_set_types }
    • Needed for explainability + reproducibility.



## Phase 2 — Core logging UX refactor (remove session lifecycle friction)
    1. Replace Home CTA
    • From START WORKOUT/ACTIVE SESSION to:
        ◦ Log Sets
        ◦ Library
        ◦ Analyze
        ◦ History
    • Reason: session lifecycle is still primary entry today.
    2. SessionScreen -> LogSetScreen
    • Remove dependency on activeSession gate for entering logging screen.
    • Logging writes set rows directly (already partly there) and refreshes grouped recents.
    • Reason: screen routing currently still requires activeSession to render session screen.
    3. Keep fast post-log loop
    • Preserve current good behavior:
        ◦ same selected exercise
        ◦ same sliders
        ◦ toast
        ◦ append in recents
    • Already partially done; retain as acceptance criteria.
    4. Set type defaults and analytics policy
    • Default set_type='working'.
    • Add quick toggle memory by exercise.
    • Metrics cards must support:
        ◦ include all
        ◦ working-only
        ◦ custom set-type filters
    • Reason: current metrics ignore set_type distinctions.
    5. Duration policy lock
    • Keep null when timer unused (already correct).
    • Add tooltip in analytics: “duration unknown if not timed” and exclude nulls from duration stats.
    • Ensure no duration imputation code anywhere.


## Phase 3 — Library-first curation UX (major missing area)
    1. Create top-level LibraryScreen
    • CRUD for exercises/equipment.
    • Search input + filter chips:
        ◦ equipment type (machine/freeweight/bodyweight/cable…)
        ◦ muscle group
    • Reuse MachineCard rendering + muscle group logic as requested.
    • Reason: not present today; editing still embedded in logging flow.
    2. Remove inline create/edit in log flow
    • In LogSetScreen:
        ◦ only select existing entries
        ◦ optional “Go to Library” shortcut
    • Remove identify/create/edit from logging context.
    • Reason: current logging still allows identify/edit inline.
    3. Conditional form by equipment type
    • In edit/create:
        ◦ if freeweight or bodyweight, hide/de-emphasize machine-specific media prompts.
        ◦ make thumbnails/instruction image optional and non-prominent.
    • Reason: currently always machine-thumbnails/instruction controls shown.
    4. Seed default catalogs on first auth load
    • Add bootstrap call that executes seed RPC once per user:
        ◦ include freeweight defaults
        ◦ include bodyweight defaults
    • Current seed function exists but is not called by app flow.



## Phase 4 — AI workflow redesign (user-controlled + persisted + explainable)
    1. Remove auto-run recommendations on “end session”
    • Delete auto-trigger path in existing end flow.
    • Reason: currently still auto-runs recommendations immediately after end action.
    2. Add Analyze menu (on-demand)
    • User selects:
        ◦ scope (last training day / 30d / custom)
        ◦ goals (strength, volume balance, recovery, consistency)
        ◦ set-type inclusion policy
    • Submit explicitly.
    3. Persist every report
    • On backend:
        ◦ create endpoint that generates and inserts into analysis_reports.
    • On frontend:
        ◦ list/filter reports
        ◦ detail view for full content
    • analysis_reports table exists but no wiring/UI yet.
    4. Evidence rendering
    • In report details:
        ◦ expandable “Why” sections per claim using evidence objects (metric/period/delta/source)
    • Backend prompt already asks for evidence; UI must render it.
    5. Weekly trends automation
    • Add scheduled backend job (cron/worker) generating weekly trend reports into analysis_reports.
    • Add Trends section (latest + previous reports).



## Phase 5 — Plans + adherence + dashboard + favorites
    1. Plan CRUD UI
    • Implement UI over existing plan tables:
        ◦ plans, plan_days, plan_items
    • Schema exists; frontend missing.
    2. Optional logging integration
    • In log screen: show “planned today” suggestions (non-blocking).
    3. Favorites ordering
    • Use equipment_set_counts to sort/pin frequent equipment:
        ◦ 30d default
        ◦ switchable window (30d/90d/all)
    • View exists but not used in selection UI yet.
    4. Home dashboard visuals + formula tooltips
    • Add:
        ◦ muscle-group workload
        ◦ weekly consistency
        ◦ workload distribution balance
    • Each chart gets explicit formula tooltip text.


## Phase 6 — Export + compliance + ops
    1. Export endpoints
    • Add backend endpoints (CSV/JSON) with date filters for:
        ◦ sets
        ◦ equipment library
        ◦ readiness/training-day logs
        ◦ plans
        ◦ AI reports
    • Timezone-safe timestamps + stable schemas.
    2. Export UI
    • Add Export screen with:
        ◦ resource selectors
        ◦ date range
        ◦ format selector
        ◦ download action + manifest preview
    3. Schema and data quality observability
    • Add health/admin metrics:
        ◦ % sets missing set_type/duration/training bucket
        ◦ report generation success rate
        ◦ export job success/failure counts


# Acceptance criteria checklist (what “done” means)
    • No user needs to start/end a session to log sets.
    • Library is the sole place for create/edit/delete of equipment.
    • Freeweight + bodyweight have first-class UX/forms and seeds.
    • AI runs only on explicit user request (plus weekly scheduler), all reports persisted.
    • Analytics can include/exclude set types and never infer duration.
    • Training-day boundary (day_start_hour) is applied consistently across history/dashboard/analysis.
    • Export available for all required domains.

