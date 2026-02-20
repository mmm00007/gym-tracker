import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'

export function useMachineHistoryQueries({ userId, machines, buildMachineHistoryEntries }) {
  const machineHistoryQueries = useQueries({
    queries: machines.map((machine) => ({
      queryKey: queryKeys.machines.history(userId, machine.id),
      queryFn: async () => buildMachineHistoryEntries(machine.id),
      enabled: false,
    })),
  })

  return useMemo(() => {
    const normalized = machines.reduce((acc, machine, index) => {
      acc.historyByMachineId[machine.id] = machineHistoryQueries[index]?.data || []
      acc.queryByMachineId[machine.id] = machineHistoryQueries[index]
      return acc
    }, {
      historyByMachineId: {},
      queryByMachineId: {},
    })

    return normalized
  }, [machines, machineHistoryQueries])
}
