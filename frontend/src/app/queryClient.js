import { QueryClient } from '@tanstack/react-query'
import { withQueryDefaults } from '../lib/queryDefaults'

let queryClient

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: withQueryDefaults({
          staleTime: 1000 * 60,
        }),
      },
    })
  }

  return queryClient
}
