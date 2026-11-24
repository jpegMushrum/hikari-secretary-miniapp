import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, memberApi, ApiError } from '../../shared/api'

export type Season = {
  id: number
  status: 'preparation' | 'open' | 'paused' | 'closed'
  budget: string
  exchange_at: string | null
  registration_until: string | null
  reminder_minutes: number
  revision: number
  confirmed: boolean
}
export type Attendance = 'unknown' | 'yes' | 'no'
export type Gift = 'unknown' | 'ready' | 'ordered' | 'not_ready'
export type Participant = {
  person_id: number
  name: string
  wishes: string
  status: 'active' | 'exit_requested' | 'excluded'
  attendance: Attendance
  gift: Gift
  gift_description: string
  telegram_id?: number
  username?: string | null
}
export type Pair = { giver_id: number; recipient_id: number }
export type AdminView = { season: Season; participants: Participant[]; pairs: Pair[] }
type Recipient = Pick<Participant, 'person_id' | 'name' | 'wishes'> & { telegram_id: number; username: string | null }
export type MemberView = { season: Season; participation: Participant | null; draft_wishes: string; recipient: Recipient | null }
export type Visibility = { visible: boolean; exchange_at?: string; registration_until?: string; confirmed?: boolean }

export const attendanceLabels: Record<Attendance, string> = { unknown: 'Пока не ответил', yes: 'Приду', no: 'Не смогу прийти' }
export const giftLabels: Record<Gift, string> = {
  unknown: 'Не подготовил', ready: 'Подарок готов', ordered: 'Подарок заказан (в пути)', not_ready: 'Нет',
}
export const stateLabels: Record<Season['status'], string> = { preparation: 'Подготовка', open: 'Открыт', paused: 'Техническая пауза', closed: 'Завершён' }
export const wishesLabel = 'Пожелания к подарку и чего лучше избегать'

export function useSantaVisibility(admin: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['santa', admin ? 'admin' : 'member', 'visibility'], enabled, retry: false,
    queryFn: ({ signal }) => (admin ? api : memberApi)<Visibility>('/santa/visibility', { signal }),
    refetchInterval: 30000, refetchOnWindowFocus: true,
  })
}

export function useSanta<T extends MemberView | AdminView>(scope: 'admin' | 'member') {
  return useQuery({
    queryKey: ['santa', scope, 'detail'], retry: false, staleTime: 0,
    queryFn: ({ signal }) => (scope === 'admin' ? api : memberApi)<T>('/santa', { signal }),
    refetchOnWindowFocus: true, refetchInterval: 15000,
  })
}
type Action = { action: string; season_id: number; revision?: number; [field: string]: unknown }
export function useSantaAction(scope: 'admin' | 'member') {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (command: Action) => {
      if (scope === 'admin' && command.action === 'reset') {
        return api<void>('/santa/reset', { method: 'POST', body: JSON.stringify({ season_id: command.season_id, revision: command.revision }) })
      }
      return (scope === 'admin' ? api : memberApi)<void>('/santa', { method: 'POST', body: JSON.stringify(command) })
    },
    onSettled: async (_, error, command) => {
      if (!error || (error instanceof ApiError && [404, 409].includes(error.status))) {
        await client.invalidateQueries({ queryKey: ['santa'] })
        if (command.action === 'reset') await client.invalidateQueries({ queryKey: ['local-inbox'] })
      }
    },
  })
}
