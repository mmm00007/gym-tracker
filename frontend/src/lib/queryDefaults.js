const minute = 1000 * 60

export const queryDefaults = {
  base: {
    gcTime: minute * 10,
    retry: 1,
    refetchOnWindowFocus: false,
  },
  authUser: {
    staleTime: minute,
  },
  machinesList: {
    staleTime: minute * 5,
    retry: 1,
  },
  setsList: {
    staleTime: minute,
    retry: 1,
  },
  sorenessPending: {
    staleTime: minute,
    retry: 1,
  },
  sorenessRecent: {
    staleTime: minute * 2,
    retry: 1,
  },
  featureFlagsAll: {
    staleTime: minute * 5,
    retry: 0,
  },
}

export const withQueryDefaults = (overrides = {}) => ({
  ...queryDefaults.base,
  ...overrides,
})
