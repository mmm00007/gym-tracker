# Data Contract Lock (Phase 0 Stabilization Baseline)

This document is the single source of truth for payload compatibility during the session-to-set-centric transition.

## Contract version

- **Version:** `2026-02-phase0`
- **Status:** Locked for Phase 0 rollout
- **Compatibility goal:** Frontend and backend can safely coexist while feature flags control behavioral cutovers.

## Rollout flags contract

The backend exposes `GET /api/rollout-flags`.

```json
{
  "setCentricLogging": false,
  "libraryScreenEnabled": false,
  "analysisOnDemandOnly": false
}
```

### Flag semantics

- `setCentricLogging`
  - `false`: session lifecycle remains primary logging path.
  - `true`: clients may route users directly to set logging without active session dependency.
- `libraryScreenEnabled`
  - `false`: current machine management UX remains in place.
  - `true`: top-level library flow can be used as authoritative CRUD surface.
- `analysisOnDemandOnly`
  - `false`: existing post-workout auto-analysis flow may run.
  - `true`: auto-analysis at session end must be skipped; analysis is user-initiated only.

---

## Set logging payload contract

### Write contract (`sets` insert)

```json
{
  "session_id": "uuid",
  "machine_id": "uuid",
  "reps": 10,
  "weight": 60,
  "duration_seconds": 42,
  "rest_seconds": 90
}
```

### Rules

- `duration_seconds` is optional and may be `null` when timing is not used.
- Missing timing data must remain unknown (`null`) and **must not be imputed**.
- `rest_seconds` is optional and may be `null`.
- During stabilization, `session_id` remains accepted while set-centric migration is prepared.

---

## Training-day grouping payload contract

Stabilization contract for grouped analytics payloads (used by analysis and later history/dashboard rollups):

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

- `training_date` is derived from `logged_at` with user day-boundary preference.
- `training_bucket_id` is the stable grouping key.
- `workout_cluster_id` is optional in Phase 0; reserved for gap-based clustering support.

---

## Analysis report payload with evidence contract

```json
{
  "summary": "Volume increased compared with prior training days.",
  "highlights": ["Pressing volume is trending upward"],
  "suggestions": ["Reduce pushing accessories if elbow soreness rises"],
  "nextSession": "Prioritize horizontal pull volume",
  "progressNotes": "Estimated strength is stable week-over-week.",
  "evidence": [
    {
      "claim": "Pressing volume increased",
      "metric": "total_volume",
      "period": "last_30d_vs_prev_30d",
      "delta": 0.11,
      "source": {
        "grouping": "training_day",
        "included_set_types": ["working"],
        "sample_size": 9
      }
    }
  ]
}
```

### Rules

- Reports should include `evidence` objects for explainability.
- `source.grouping` must identify the aggregation basis (`training_day` or `cluster`).
- `included_set_types` must be explicit so results are reproducible.

