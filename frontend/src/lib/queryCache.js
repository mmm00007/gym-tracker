import { isUserScopedQueryKey } from './queryKeys'

export async function clearUserScopedQueryCache(queryClient) {
  await queryClient.cancelQueries({ predicate: (query) => isUserScopedQueryKey(query.queryKey) })
  queryClient.removeQueries({ predicate: (query) => isUserScopedQueryKey(query.queryKey) })
}

