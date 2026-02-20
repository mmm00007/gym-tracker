import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_FLAGS, getFeatureFlags } from '../../../lib/featureFlags'
import { queryDefaults, withQueryDefaults } from '../../../lib/queryDefaults'
import { queryKeys } from '../../../lib/queryKeys'
import {
  getMachines,
  getPendingSoreness,
  getRecentSoreness,
  getSets,
  supabase,
} from '../../../lib/supabase'

const normalizeArray = (value) => (Array.isArray(value) ? value : [])

export function useCurrentUserQuery(options = {}) {
  const queryClient = useQueryClient()
  const authUserQueryKey = useMemo(() => queryKeys.auth.user(), [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(authUserQueryKey, session?.user || null)
      queryClient.invalidateQueries({ queryKey: authUserQueryKey })
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
    ...options,
  })
}

export function useFeatureFlagsQuery(options = {}) {
  return useQuery({
    queryKey: queryKeys.featureFlags.all(),
    queryFn: async () => {
      const flags = await getFeatureFlags()
      return flags || DEFAULT_FLAGS
    },
    ...withQueryDefaults(queryDefaults.featureFlagsAll),
    ...options,
  })
}

export function useMachinesQuery(userOrId, options = {}) {
  return useQuery({
    queryKey: queryKeys.machines.list(userOrId),
    queryFn: async () => normalizeArray(await getMachines()),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.machinesList),
    ...options,
  })
}

export function useSetsQuery(userOrId, options = {}) {
  return useQuery({
    queryKey: queryKeys.sets.list(userOrId),
    queryFn: async () => normalizeArray(await getSets()),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.setsList),
    ...options,
  })
}

export function useRecentSorenessQuery(userOrId, options = {}) {
  return useQuery({
    queryKey: queryKeys.soreness.recent(userOrId),
    queryFn: async () => normalizeArray(await getRecentSoreness()),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.sorenessRecent),
    ...options,
  })
}

export function usePendingSorenessQuery(userOrId, options = {}) {
  return useQuery({
    queryKey: queryKeys.soreness.pending(userOrId),
    queryFn: async () => normalizeArray(await getPendingSoreness())
      .map((entry) => ({
        ...entry,
        _sets: normalizeArray(entry?._sets),
      })),
    enabled: Boolean(userOrId),
    ...withQueryDefaults(queryDefaults.sorenessPending),
    ...options,
  })
}
