# Data Contract Lock (Phase 1 Data Model Completion)

This document is the single source of truth for payload compatibility after the Phase 1 DB-first cutover.

## Contract version

- **Version:** `2026-02-phase1`
- **Status:** Locked for Phase 1 rollout
- **Compatibility goal:** Set-centric ownership and training-bucket grouping are now authoritative, with no legacy migration path.

## Backend canonical DTO contracts (stabilized)

Canonical backend DTOs live in `backend/schemas/forms.py`. Route handlers should reference that module and must not redefine request schema details inline.

### `MachineDTO` (stabilized app payload for `machines`/equipment)

> Canonical shape for machine/equipment payloads exchanged with API-adjacent workflows.

- **Model name:** `MachineDTO` (documented contract for machine/equipment payloads)
- **Required fields:**
  - `id: uuid`
  - `user_id: uuid`
  - `name: non-empty string`
  - `movement: non-empty string`
  - `equipment_type: "machine" | "freeweight" | "bodyweight" | "cable" | "band" | "other"`
  - `muscle_groups: string[]` (at least one muscle group)
- **Optional fields:**
  - `thumbnails: string[]` (default `[]`)
  - `instruction_image: string | null` (default `null`)
  - `source: string | null` (default `null`)
  - `notes: string | null`
- **Accepted ranges/enums:**
  - `equipment_type` enum is fixed to the six values above.
  - For non-`machine` equipment: `thumbnails` must be empty, `instruction_image` must be `null`, and `source` must be `null`.
- **Backward-compatibility policy:**
  - Additive-only changes are allowed (new optional fields).
  - Existing field name/type/semantics are frozen for Phase 1 contract version.
  - Breaking changes require explicit versioning and a changelog entry.

### `RecommendationRequest` (`schemas.forms.RecommendationRequest`)

- **Model name:** `RecommendationRequest`
- **Required fields:** none globally required; valid request must provide either canonical grouped payload (`scope` + `grouped_training`) or legacy session payload (`current_session`/`past_sessions`) that is normalized server-side.
- **Optional fields:**
  - Canonical: `scope`, `grouped_training`, `equipment`, `soreness_data`, `scope_id`
  - Backward-compatible legacy: `current_session`, `past_sessions`, `machines`
- **Accepted ranges/enums:**
  - `scope.grouping`: `training_day | cluster | training_week`
  - `scope.included_set_types`: non-empty strings; `[]` normalizes to `["working"]`
  - `scope.goals`: deduplicated non-empty strings
  - `soreness_data`: array of soreness entry objects
- **Backward-compatibility policy:**
  - Canonical grouped contract is preferred and frozen.
  - Legacy session fields remain supported during compatibility window and are transformed by `normalize_recommendation_request`.
  - Removal/rename/type changes of canonical fields require versioning + changelog entry.

### `SorenessReportEntry` (`schemas.forms.SorenessReportEntry`)

- **Model name:** `SorenessReportEntry`
- **Required fields (stabilized semantic contract):**
  - `training_bucket_id: string`
  - `muscle_group: string`
  - `level: integer`
- **Optional fields:** additional metadata keys are allowed and preserved.
- **Accepted ranges/enums:**
  - `level`: integer scale `0..3` (operational contract used by analysis/reporting)
  - `training_bucket_id`: training-day key format (for example `training_day:YYYY-MM-DD`)
- **Backward-compatibility policy:**
  - Core semantic fields above are frozen.
  - Extra additive fields are allowed.
  - Breaking changes to soreness semantics require explicit versioning + changelog entry.

### `RecommendationReportPayload` (stabilized `/api/recommendations` response payload shape)

- **Model name:** `RecommendationReportPayload`
- **Required fields:**
  - `summary: string`
  - `highlights: string[]`
  - `suggestions: string[]`
  - `nextSession: string`
  - `progressNotes: string`
  - `evidence: EvidenceItem[]`
  - `report_persisted: boolean` (server-added)
- **Optional fields:**
  - `scope_id: uuid` (when validated)
  - `report_id: uuid` (when persistence succeeds)
- **Accepted ranges/enums:**
  - `evidence[].source.grouping`: `training_day | cluster`
  - `evidence[].source.sample_size`: integer `>= 0`
  - `evidence[].delta`: number
- **Backward-compatibility policy:**
  - Existing top-level response keys are frozen.
  - New optional keys may be added.
  - Breaking response-shape changes require explicit API versioning and changelog entry.

---

## Rollout flags contract

The backend exposes `GET /api/rollout-flags`.

```json
{
  "setCentricLogging": true,
  "libraryScreenEnabled": true,
  "analysisOnDemandOnly": true,
  "plansEnabled": true,
  "favoritesOrderingEnabled": true,
  "homeDashboardEnabled": true,
  "machineRatingEnabled": true,
  "pinnedFavoritesEnabled": true,
  "machineAutofillEnabled": true,
  "weightedMuscleProfileWorkloadEnabled": true,
  "fixedOptionMachineTaxonomyEnabled": true
}
```

### Flag semantics

- `setCentricLogging`
  - `true`: set writes are authorized by `sets.user_id` and grouped by training bucket.
- `libraryScreenEnabled`
  - `false`: library destination is hidden and app redirects to Home.
- `analysisOnDemandOnly`
  - `true`: analysis runs on explicit user action only.
- `plansEnabled`
  - `false`: plans destination is hidden and app redirects to Home.
- `favoritesOrderingEnabled`
  - `false`: favorites recency window controls are hidden in Log flow.
- `homeDashboardEnabled`
  - `false`: dashboard cards on Home are hidden.
- `machineRatingEnabled`
  - `false`: rating input/display/sort signals are disabled.
- `pinnedFavoritesEnabled`
  - `false`: favorite toggle/icon/sort signals are disabled.
- `machineAutofillEnabled`
  - `false`: machine photo autofill panel is disabled; manual entry remains.
- `weightedMuscleProfileWorkloadEnabled`
  - `false`: workload uses even split by tagged muscle groups instead of weighted profile percentages.
- `fixedOptionMachineTaxonomyEnabled`
  - `false`: manual movement + comma-separated muscle group entry path is used instead of fixed option chips.

---


## Session compatibility decision (Phase 1)

- Keep `sessions` for historical compatibility only.
- Keep `sets.session_id` nullable as optional legacy linkage during Phase 1.
- Treat training buckets (`training_date`, `training_bucket_id`) and `sets.user_id` as authoritative for grouping/auth.

---
## Set logging payload contract

### Write contract (`sets` insert)

```json
{
  "user_id": "uuid",
  "session_id": "uuid-or-null",
  "machine_id": "uuid",
  "reps": 10,
  "weight": 60,
  "set_type": "working",
  "duration_seconds": 42,
  "rest_seconds": 90,
  "logged_at": "2026-02-10T20:15:00Z"
}
```

### Rules

- `user_id` is required and is the primary authorization key.
- `session_id` is optional, non-authoritative, and retained only for historical compatibility.
- `set_type` defaults to `working`.
- `duration_seconds` is optional and may be `null` when timing is not used.
- Missing timing data must remain unknown (`null`) and **must not be imputed**.
- `training_date` and `training_bucket_id` are DB-computed from `logged_at`, `user_preferences.day_start_hour`, and `user_preferences.timezone`.

---

## Equipment payload contract

DB table name remains `machines`, but app-level semantics are `equipment`.

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Incline Dumbbell Press",
  "movement": "Horizontal Push",
  "equipment_type": "freeweight",
  "muscle_groups": ["Chest", "Shoulders", "Triceps"],
  "thumbnails": [],
  "instruction_image": null,
  "source": null,
  "notes": "Neutral grip"
}
```

### Rules

- Required for all equipment: `name`, `movement`, `equipment_type`, `muscle_groups`.
- Allowed equipment types: `machine`, `freeweight`, `bodyweight`, `cable`, `band`, `other`.
- For non-machine equipment, machine-specific media fields are disallowed by DB constraint:
  - `thumbnails` must be empty.
  - `instruction_image` must be `null`.
  - `source` must be `null`.

---

## Training-day grouping payload contract

```json
{
  "grouping": "training_day",
  "training_date": "2026-02-10",
  "training_bucket_id": "training_day:2026-02-10",
  "workout_cluster_id": null,
  "set_count": 14,
  "total_volume": 12840,
  "muscle_groups": ["Chest", "Triceps"]
}
```

### Rules

- `training_date` and `training_bucket_id` are always present on every set.
- `workout_cluster_id` is optional and reserved for gap-clustering logic.
- `training_bucket_id` is the primary grouping key for reporting and soreness prompts.

---

## Soreness payload contract

```json
{
  "user_id": "uuid",
  "training_bucket_id": "training_day:2026-02-10",
  "muscle_group": "Chest",
  "level": 2
}
```

### Rules

- Soreness is linked to `training_bucket_id` (not session id).
- One soreness row per `(user_id, training_bucket_id, muscle_group)`.

---

## Recommendation request + scope contract

```json
{
  "scope": {
    "grouping": "training_day",
    "date_start": "2026-01-10",
    "date_end": "2026-02-10",
    "included_set_types": ["working"]
  },
  "scope_id": "<uuid>",
  "grouped_training": [
    {
      "training_bucket_id": "training_day:2026-02-10",
      "training_date": "2026-02-10",
      "workout_cluster_id": null,
      "started_at": "2026-02-10T20:00:00Z",
      "ended_at": "2026-02-10T21:10:00Z",
      "sets": []
    }
  ],
  "equipment": {
    "<equipment_id>": {
      "name": "Incline Dumbbell Press",
      "movement": "Horizontal Push",
      "muscle_groups": ["Chest", "Triceps"],
      "equipment_type": "freeweight"
    }
  },
  "soreness_data": []
}
```

### Rules

- `/api/recommendations` must consume the set-grouped request contract above.
- Persisted scope must always include grouping basis and set-type inclusion policy.
- Scope rows are used for explainability and reproducibility of recommendations/analysis.
- Clients should persist `public.recommendation_scopes` before recommendation calls and include `scope_id` in analysis/report payloads.

---

## Plan adherence contract

### Matching strategy (`plan_items` ↔ logged sets)

For adherence calculations, each `plan_items` row matches logged sets using a **deterministic key** and a training-day window:

- Match key: `(machine_id, target_set_type)` from plan item to `(machine_id, set_type)` from set.
- Set type fallback: missing values are normalized to `working` on both sides.
- Training-day scope: only sets inside the selected `training_date` bucket are considered.
  - Preferred source: `sets.training_date` when present.
  - Fallback source: derive from `logged_at` using `day_start_hour` boundary in local user context.

### Day boundary and timezone handling

- The training day starts at `day_start_hour` (e.g., 04:00) and runs for 24h.
- If a set timestamp is earlier than `day_start_hour`, it belongs to the previous training day.
- Date-only keys (`YYYY-MM-DD`) are parsed with UTC-safe midday normalization to avoid off-by-one drift across DST/timezone offsets.

### Planned vs completed formulas

For a day (and analogously aggregated for a week):

- `planned_sets = sum(max(target_sets, 0))` across items with numeric positive targets.
- `completed_sets = sum(min(item_completed_sets, item_target_sets))` across items with targets.
- `touched_items = count(items with >=1 matched set allocated)`.

Primary ratio:

- If `planned_sets > 0`:
  - `adherence_ratio = completed_sets / planned_sets`.
- Else (no numeric set targets):
  - `adherence_ratio = touched_items / total_plan_items`.

### Partial completion rules

Per item:

- **Complete**
  - target-based item: `allocated_sets >= target_sets`
  - no target_sets: at least one matched set (`touched`).
- **Partial**
  - target-based item only: `0 < allocated_sets < target_sets`.
- **Not started**
  - `allocated_sets = 0`.

### Deterministic tie-breaking for duplicate keys

When multiple `plan_items` share the same `(machine_id, set_type)` key on the same day:

1. Sort items by `order_index` ascending.
2. Tie-break by `id` lexicographically ascending.
3. Allocate matched sets in that order until each target is filled.
4. Any surplus matched sets are allocated to zero-target items in the same deterministic order.

This ensures stable, reproducible adherence outputs across clients.
