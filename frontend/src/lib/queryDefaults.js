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
  },
  setsList: {
    staleTime: minute,
  },
  sorenessPending: {
    staleTime: minute,
  },
  sorenessRecent: {
    staleTime: minute * 2,
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
