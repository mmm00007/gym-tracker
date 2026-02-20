import {
  useCurrentUserQuery,
  useMachinesQuery,
  useSetsQuery,
  useRecentSorenessQuery,
  usePendingSorenessQuery,
  useFeatureFlagsQuery,
} from '../../data/hooks'

export function useAppData({ catalogBootstrapComplete }) {
  const authUserQuery = useCurrentUserQuery()
  const userLoading = authUserQuery.status === 'pending'
  const user = authUserQuery.data ?? null
  const userId = user?.id

  const featureFlagsQuery = useFeatureFlagsQuery({ enabled: !userLoading })
  const machinesQuery = useMachinesQuery(userId, {
    enabled: Boolean(userId) && catalogBootstrapComplete,
  })
  const setsQuery = useSetsQuery(userId)
  const sorenessHistoryQuery = useRecentSorenessQuery(userId)
  const pendingSorenessQuery = usePendingSorenessQuery(userId)

  return {
    authUserQuery,
    userLoading,
    user,
    userId,
    featureFlagsQuery,
    machinesQuery,
    setsQuery,
    sorenessHistoryQuery,
    pendingSorenessQuery,
  }
}
