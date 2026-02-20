import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { withQueryDefaults } from '../lib/queryDefaults'
import { reportQueryError } from '../lib/queryErrorHandling'

let queryClient

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (query?.meta?.suppressGlobalError) return
          reportQueryError(error, {
            source: 'query',
            queryKey: query?.queryKey,
            operationName: query?.meta?.operationName,
          })
        },
      }),
      mutationCache: new MutationCache({
        onError: (error, _variables, _context, mutation) => {
          if (mutation?.meta?.suppressGlobalError) return
          reportQueryError(error, {
            source: 'mutation',
            mutationKey: mutation?.options?.mutationKey,
            operationName: mutation?.meta?.operationName,
          })
        },
      }),
      defaultOptions: {
        queries: withQueryDefaults({
          staleTime: 1000 * 60,
        }),
      },
    })
  }

  return queryClient
}
