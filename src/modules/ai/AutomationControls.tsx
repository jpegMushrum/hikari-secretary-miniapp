import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AIAutomation } from '../../shared/api'
import { ErrorState, Loading } from '../../shared/components'

const path = '/ai/automation'

export function AutomationControls() {
  const client = useQueryClient()
  const automation = useQuery({
    queryKey: [path],
    queryFn: ({ signal }) => api<AIAutomation>(path, { signal }),
    refetchInterval: 15000,
  })
  const action = useMutation({
    mutationFn: (value: boolean | number) =>
      typeof value === 'number'
        ? api<AIAutomation>(path + '/cancel-queued', { method: 'POST', body: JSON.stringify({ publication_id: value }) })
        : api<AIAutomation>(path, { method: 'PUT', body: JSON.stringify({ enabled: value }) }),
    onSuccess: (state) => client.setQueryData([path], state),
    onSettled: () =>
      Promise.all(
        [path, 'ai-latest', 'ai-queued', '/ai/history', 'ai-job', '/publications', 'publication', '/event-workspace'].map(
          (key) => client.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  })

  return (
    <>
      {automation.isPending ? (
        <Loading />
      ) : automation.error ? (
        <ErrorState error={automation.error} retry={() => void automation.refetch()} />
      ) : (
        <>
          <button
            type="button"
            className="button secondary"
            disabled={action.isPending || !automation.data.can_cancel_queued || automation.data.queued_publication_id == null}
            onClick={() => {
              const id = automation.data.queued_publication_id
              if (id != null) action.mutate(id)
            }}
          >
            Отменить выход поста
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={action.isPending || !automation.data.configured}
            onClick={() => action.mutate(!automation.data.enabled)}
          >
            {automation.data.enabled ? 'Выключить автогенерацию' : 'Включить автогенерацию'}
          </button>
          {action.isSuccess && typeof action.variables === 'number' && (
            <p className="muted" role="status">Выход поста отменён.</p>
          )}
          {action.error && <ErrorState error={action.error} />}
        </>
      )}
    </>
  )
}
