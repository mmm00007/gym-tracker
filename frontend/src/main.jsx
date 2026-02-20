import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { getQueryClient } from './app/queryClient'
import './index.css'

const queryClient = getQueryClient()

function Devtools() {
  const [DevtoolsComponent, setDevtoolsComponent] = React.useState(null)

  React.useEffect(() => {
    let isMounted = true

    import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => {
      if (isMounted) {
        setDevtoolsComponent(() => ReactQueryDevtools)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  if (!DevtoolsComponent) {
    return null
  }

  return <DevtoolsComponent initialIsOpen={false} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV ? <Devtools /> : null}
    </QueryClientProvider>
  </React.StrictMode>
)
