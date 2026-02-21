import { useMemo } from 'react'
import { buildTrainingBuckets } from '../../../lib/trainingBuckets'

export function useTrainingBuckets({ sets, machines }) {
  return useMemo(() => buildTrainingBuckets(sets, machines), [sets, machines])
}
