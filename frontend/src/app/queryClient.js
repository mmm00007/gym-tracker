import { QueryClient } from '@tanstack/react-query'

let queryClient

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60,
          gcTime: 1000 * 60 * 10,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    })
  }

  return queryClient
}
