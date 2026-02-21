export const buildTrainingBuckets = (sets, machines) => {
  const buckets = new Map()

  sets.forEach((set) => {
    const bucketId = set.training_bucket_id || `training_day:${new Date(set.logged_at).toISOString().slice(0, 10)}`
    const existing = buckets.get(bucketId) || {
      training_bucket_id: bucketId,
      training_date: set.training_date || bucketId.replace('training_day:', ''),
      workout_cluster_id: set.workout_cluster_id || null,
      workout_cluster_ids: [],
      started_at: set.logged_at,
      ended_at: set.logged_at,
      sets: [],
    }

    if (set.workout_cluster_id && !existing.workout_cluster_ids.includes(set.workout_cluster_id)) {
      existing.workout_cluster_ids.push(set.workout_cluster_id)
    }

    existing.workout_cluster_id = existing.workout_cluster_ids.length === 1
      ? existing.workout_cluster_ids[0]
      : null

    existing.sets.push({
      machine_id: set.machine_id,
      machine_name: machines.find((machine) => machine.id === set.machine_id)?.movement || 'Unknown',
      reps: set.reps,
      weight: set.weight,
      set_type: set.set_type || 'working',
      duration_seconds: set.duration_seconds ?? null,
      rest_seconds: set.rest_seconds ?? null,
      logged_at: set.logged_at,
      workout_cluster_id: set.workout_cluster_id || null,
    })

    if (new Date(set.logged_at) < new Date(existing.started_at)) existing.started_at = set.logged_at
    if (new Date(set.logged_at) > new Date(existing.ended_at)) existing.ended_at = set.logged_at

    buckets.set(bucketId, existing)
  })

  return [...buckets.values()].sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
}
