import { addLog } from './logs'

let customQueryErrorHandler = null

const getErrorMessage = (error) => {
  if (!error) return 'Request failed.'
  if (typeof error === 'string') return error
  if (error.userMessage && typeof error.userMessage === 'string') return error.userMessage
  if (error.message && typeof error.message === 'string') return error.message
  return 'Request failed.'
}

export function setQueryErrorHandler(handler) {
  customQueryErrorHandler = typeof handler === 'function' ? handler : null
}

export function reportQueryError(error, context = {}) {
  const source = context?.source === 'mutation' ? 'mutation' : 'query'
  const queryKey = Array.isArray(context?.queryKey) ? context.queryKey : []
  const message = getErrorMessage(error)

  addLog({
    level: 'error',
    event: `react_query.${source}.error`,
    message,
    meta: {
      queryKey,
      mutationKey: context?.mutationKey,
      operationName: context?.operationName,
    },
  })

  if (customQueryErrorHandler) {
    customQueryErrorHandler({
      source,
      error,
      message,
      queryKey,
      mutationKey: context?.mutationKey,
      operationName: context?.operationName,
    })
  }
}

