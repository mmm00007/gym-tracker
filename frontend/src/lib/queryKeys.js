const resolveUserId = (userOrId) => {
  if (userOrId && typeof userOrId === 'object') return userOrId.id ?? 'anonymous'
  return userOrId ?? 'anonymous'
}

export const auth = {
  user: () => ['auth', 'user'],
}

export const machines = {
  list: (userId) => ['machines', 'list', resolveUserId(userId)],
  history: (userId, machineId) => ['machines', 'history', resolveUserId(userId), machineId ?? 'unknown'],
}

export const sets = {
  list: (userId) => ['sets', 'list', resolveUserId(userId)],
}

export const soreness = {
  pending: (userId) => ['soreness', 'pending', resolveUserId(userId)],
  recent: (userId) => ['soreness', 'recent', resolveUserId(userId)],
}

export const featureFlags = {
  all: () => ['featureFlags', 'all'],
}

export const queryKeys = {
  auth,
  machines,
  sets,
  soreness,
  featureFlags,
}

const USER_SCOPED_QUERY_ROOTS = new Set(['machines', 'sets', 'soreness'])

export const isUserScopedQueryKey = (queryKey) => (
  Array.isArray(queryKey) && queryKey.length > 0 && USER_SCOPED_QUERY_ROOTS.has(queryKey[0])
)
