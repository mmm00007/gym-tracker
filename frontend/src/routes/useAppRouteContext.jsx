import { useOutletContext } from '@tanstack/react-router'

export function useAppRouteContext() {
  return useOutletContext()
}
