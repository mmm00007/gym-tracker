import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { getQueryClient } from './app/queryClient'
import { router } from './app/router'
import './index.css'

const queryClient = getQueryClient()

function Devtools() {
  const [QueryDevtoolsComponent, setQueryDevtoolsComponent] = React.useState(null)
  const [RouterDevtoolsComponent, setRouterDevtoolsComponent] = React.useState(null)

  React.useEffect(() => {
    let isMounted = true

    import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => {
      if (isMounted) {
        setQueryDevtoolsComponent(() => ReactQueryDevtools)
      }
    })

    import('@tanstack/router-devtools').then(({ TanStackRouterDevtools }) => {
      if (isMounted) {
        setRouterDevtoolsComponent(() => TanStackRouterDevtools)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <>
      {QueryDevtoolsComponent ? <QueryDevtoolsComponent initialIsOpen={false} /> : null}
      {RouterDevtoolsComponent ? <RouterDevtoolsComponent router={router} /> : null}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV ? <Devtools /> : null}
    </QueryClientProvider>
  </React.StrictMode>
)
