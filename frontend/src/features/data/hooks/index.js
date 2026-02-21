import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_FLAGS, getFeatureFlags } from '../../../lib/featureFlags'
import { clearUserScopedQueryCache } from '../../../lib/queryCache'
import { queryDefaults, withQueryDefaults } from '../../../lib/queryDefaults'
import { queryKeys } from '../../../lib/queryKeys'
import {
  deleteMachine,
  deleteSet,
  getMachines,
  getPendingSoreness,
  getRecentSoreness,
  getSets,
  logSet,
  submitSoreness,
  supabase,
  upsertMachine,
} from '../../../lib/supabase'
export { useMachineHistoryQueries } from './useMachineHistoryQueries'

const normalizeArray = (value) => (Array.isArray(value) ? value : [])
const LOG_SET_OPTIMISTIC_UPDATES_ENABLED = false
const withOperationMeta = (meta, operationName) => ({
  ...meta,
  operationName: meta?.operationName || operationName,
})

const callHandler = (handler, ...args) => {
  if (typeof handler === 'function') {
    return handler(...args)
  }
  return undefined
}

export function useCurrentUserQuery(options = {}) {
  const queryClient = useQueryClient()
  const authUserQueryKey = useMemo(() => queryKeys.auth.user(), [])
  const { meta, ...queryOptions } = options

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      queryClient.setQueryData(authUserQueryKey, session?.user || null)
      queryClient.invalidateQueries({ queryKey: authUserQueryKey })

      if (event === 'SIGNED_OUT' || !session?.user) {
        await clearUserScopedQueryCache(queryClient)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [authUserQueryKey, queryClient])

  return useQuery({
    queryKey: authUserQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error) throw error
      return data?.user || null
    },
    ...withQueryDefaults(queryDefaults.authUser),
    ...queryOptions,
    meta: withOperationMeta(meta, 'auth.getCurrentUser'),
  })
}

export function useFeatureFlagsQuery(options = {}) {
  return useQuery(getFeatureFlagsQueryOptions(options))
}

export function getFeatureFlagsQueryOptions(options = {}) {
  const { meta, ...queryOptions } = options

  return {
    queryKey: queryKeys.featureFlags.all(),
    queryFn: async () => {
      const flags = await getFeatureFlags()
      return flags || DEFAULT_FLAGS
    },
    ...withQueryDefaults(queryDefaults.featureFlagsAll),
    ...queryOptions,
    meta: withOperationMeta(meta, 'featureFlags.getAll'),
  }
}

export function useMachinesQuery(userOrId, options = {}) {
  const { meta, ...queryOptions } = options

  return useQuery({
    queryKey: queryKeys.machines.list(userOrId),
    queryFn: async () => normalizeArray(await getMachines()),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.machinesList),
    ...queryOptions,
    meta: withOperationMeta(meta, 'machines.getAll'),
  })
}

export function useSetsQuery(userOrId, options = {}) {
  const { meta, ...queryOptions } = options

  return useQuery({
    queryKey: queryKeys.sets.list(userOrId),
    queryFn: async () => normalizeArray(await getSets()),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.setsList),
    ...queryOptions,
    meta: withOperationMeta(meta, 'sets.getAll'),
  })
}

export function useRecentSorenessQuery(userOrId, options = {}) {
  const { meta, ...queryOptions } = options

  return useQuery({
    queryKey: queryKeys.soreness.recent(userOrId),
    queryFn: async () => normalizeArray(await getRecentSoreness()),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.sorenessRecent),
    ...queryOptions,
    meta: withOperationMeta(meta, 'soreness.getRecent'),
  })
}

export function usePendingSorenessQuery(userOrId, options = {}) {
  const { meta, ...queryOptions } = options

  return useQuery({
    queryKey: queryKeys.soreness.pending(userOrId),
    queryFn: async () => normalizeArray(await getPendingSoreness())
      .map((entry) => ({
        ...entry,
        _sets: normalizeArray(entry?._sets),
      })),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.sorenessPending),
    ...queryOptions,
    meta: withOperationMeta(meta, 'soreness.getPending'),
  })
}

export function useLogSetMutation(userOrId, options = {}) {
  const queryClient = useQueryClient()
  const { onMutate, onSuccess, onError, meta, ...mutationOptions } = options

  return useMutation({
    mutationFn: ({ sessionId = null, machineId, reps, weight, durationSeconds, restSeconds, setType = 'working' }) => (
      logSet(sessionId, machineId, reps, weight, durationSeconds, restSeconds, setType)
    ),
    onMutate: async (variables) => {
      // Explicitly disabled for now because set logging is high-frequency and server-side
      // shape/ordering drives several dependent experiences (history + soreness prompts).
      if (!LOG_SET_OPTIMISTIC_UPDATES_ENABLED) {
        return { optimisticUpdateApplied: false }
      }

      return callHandler(onMutate, variables)
    },
    onSuccess: (data, variables, context) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sets.list(userOrId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.soreness.pending(userOrId) })
      callHandler(onSuccess, data, variables, context)
    },
    onError: (error, variables, context) => {
      callHandler(onError, error, variables, context)
    },
    ...mutationOptions,
    meta: withOperationMeta(meta, 'sets.logSet'),
  })
}

export function useDeleteSetMutation(userOrId, options = {}) {
  const queryClient = useQueryClient()
  const { onSuccess, onError, meta, ...mutationOptions } = options

  return useMutation({
    mutationFn: (setId) => deleteSet(setId),
    onSuccess: async (data, variables, context) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sets.list(userOrId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.soreness.pending(userOrId) }),
      ])
      callHandler(onSuccess, data, variables, context)
    },
    onError: (error, variables, context) => {
      callHandler(onError, error, variables, context)
    },
    ...mutationOptions,
    meta: withOperationMeta(meta, 'sets.delete'),
  })
}

export function useUpsertMachineMutation(userOrId, options = {}) {
  const queryClient = useQueryClient()
  const { onSuccess, onError, meta, ...mutationOptions } = options

  return useMutation({
    mutationFn: (machineData) => upsertMachine(machineData),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.machines.list(userOrId) })
      callHandler(onSuccess, data, variables, context)
    },
    onError: (error, variables, context) => {
      callHandler(onError, error, variables, context)
    },
    ...mutationOptions,
    meta: withOperationMeta(meta, 'machines.upsert'),
  })
}

export function useDeleteMachineMutation(userOrId, options = {}) {
  const queryClient = useQueryClient()
  const { onSuccess, onError, meta, ...mutationOptions } = options

  return useMutation({
    mutationFn: (machineId) => deleteMachine(machineId),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.machines.list(userOrId) })
      callHandler(onSuccess, data, variables, context)
    },
    onError: (error, variables, context) => {
      callHandler(onError, error, variables, context)
    },
    ...mutationOptions,
    meta: withOperationMeta(meta, 'machines.delete'),
  })
}

export function useSubmitSorenessMutation(userOrId, options = {}) {
  const queryClient = useQueryClient()
  const { onSuccess, onError, meta, ...mutationOptions } = options

  return useMutation({
    mutationFn: ({ trainingBucketId, reports }) => submitSoreness(trainingBucketId, reports),
    onSuccess: async (data, variables, context) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.soreness.pending(userOrId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.soreness.recent(userOrId) }),
      ])
      callHandler(onSuccess, data, variables, context)
    },
    onError: (error, variables, context) => {
      callHandler(onError, error, variables, context)
    },
    ...mutationOptions,
    meta: withOperationMeta(meta, 'soreness.submit'),
  })
}
