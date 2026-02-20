import { useEffect, useState } from 'react'
import { useCurrentUserQuery } from '../../data/hooks'
import { bootstrapDefaultEquipmentCatalog } from '../../../lib/supabase'
import { addLog } from '../../../lib/logs'

export function useCatalogBootstrap() {
  const authUserQuery = useCurrentUserQuery()
  const userId = authUserQuery.data?.id
  const [catalogBootstrapComplete, setCatalogBootstrapComplete] = useState(false)

  useEffect(() => {
    if (!userId) {
      setCatalogBootstrapComplete(false)
      return undefined
    }

    let cancelled = false
    setCatalogBootstrapComplete(false)

    const seedCatalog = async () => {
      try {
        await bootstrapDefaultEquipmentCatalog()
      } catch (seedError) {
        addLog({ level: 'warn', event: 'catalog.seed_failed', message: seedError?.message || 'Default catalog seed failed.' })
      } finally {
        if (!cancelled) setCatalogBootstrapComplete(true)
      }
    }

    seedCatalog()

    return () => {
      cancelled = true
    }
  }, [userId])

  return {
    catalogBootstrapComplete,
  }
}
