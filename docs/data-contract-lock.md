# Data Contract Lock (Phase 1 Data Model Completion)

This document is the single source of truth for payload compatibility after the Phase 1 DB-first cutover.

## Contract version

- **Version:** `2026-02-phase1`
- **Status:** Locked for Phase 1 rollout
- **Compatibility goal:** Set-centric ownership and training-bucket grouping are now authoritative, with no legacy migration path.

## Rollout flags contract

The backend exposes `GET /api/rollout-flags`.

```json
{
  "setCentricLogging": true,
  "libraryScreenEnabled": false,
  "analysisOnDemandOnly": false
}
```

### Flag semantics

- `setCentricLogging`
  - `true`: set writes are authorized by `sets.user_id` and grouped by training bucket.
- `libraryScreenEnabled`
  - `false`: existing management UX remains in place until the dedicated library screen ships.
- `analysisOnDemandOnly`
  - `false`: unchanged in Phase 1; redesigned analysis workflow is Phase 4.

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
