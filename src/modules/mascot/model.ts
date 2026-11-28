import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, memberApi } from '../../shared/api'

export type Scope = 'admin' | 'member'
export type Phase = 'preparation' | 'submissions' | 'moderation' | 'voting' | 'results' | 'published'
export const phaseLabel: Record<Phase, string> = {
  preparation: 'Подготовка', submissions: 'Приём концептов', moderation: 'Модерация',
  voting: 'Голосование', results: 'Закрытые итоги', published: 'Итоги',
}
export type ImageRef = { key: string; ai: boolean }
export type Entry = { id: number; name: string; description: string; images: ImageRef[]; approved: boolean; author?: string; author_username?: string; author_telegram_id?: number }
export type Result = { entry_id: number; name: string; place: number; likes: number; skips: number; percent: number | null }
export type Round = { number: number; cancelled: boolean; rows: Result[] }
export type View = {
  season: { id: number; phase: Phase; deadline: string | null; round: number; winner_id: number | null }
  eligible: boolean; can_vote: boolean
  entries: Entry[]; card: Entry | null; remaining: number; rounds: Round[]; finalists: number[]
  pending_images: string[]
}

// Return only keys still needing cleanup so a partial failure can be retried.
export async function discardImages(keys: string[]) {
  const failed: string[] = []
  for (const key of keys) {
    try {
      await memberApi<void>('/mascot/images/' + encodeURIComponent(key), { method: 'DELETE' })
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) failed.push(key)
    }
  }
  return failed
}
export type Action = { action: 'open'; deadline: string } | { action: 'moderate'; entry_id: number; approved: boolean }
  | { action: 'start' | 'finish' | 'publish' }
  | { action: 'choose' | 'withdraw'; entry_id: number } | { action: 'runoff'; entry_ids: number[] }
  | { action: 'vote'; entry_id: number; like: boolean }
  | { action: 'submit'; entry_id: number; name: string; description: string; images: ImageRef[]; request_id: string }
  | { action: 'test_deadline' | 'test_reset' }
export type Send = (command: Action) => Promise<void>

export function useMascotVisibility(admin: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['mascot', admin ? 'admin' : 'member', 'visibility'], enabled, retry: false,
    queryFn: ({ signal }) => (admin ? api : memberApi)<{ visible: boolean; submission_until?: string }>('/mascot/visibility', { signal }),
    refetchInterval: 15_000, refetchOnWindowFocus: true,
  })
}

export function useMascotView(scope: Scope) {
  return useQuery({
    queryKey: ['mascot', scope, 'view'], retry: false, staleTime: 0,
    queryFn: ({ signal }) => (scope === 'admin' ? api : memberApi)<View>('/mascot', { signal }),
    refetchInterval: 4_000, refetchOnWindowFocus: true,
  })
}

export function useResultConcept(scope: Scope, seasonID: number, entryID: number) {
  return useQuery({
    queryKey: ['mascot', scope, 'result-concept', seasonID, entryID], retry: false,
    queryFn: ({ signal }) => (scope === 'admin' ? api : memberApi)<Entry>('/mascot/results/entries/' + entryID, { signal }),
  })
}

export function useMascotActions(scope: Scope, season?: View['season']) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (action: Action) => {
      if (!season) throw new Error('Сезон недоступен')
      if (action.action === 'test_deadline' || action.action === 'test_reset') {
        const path = action.action === 'test_reset' ? '/mascot/test-reset' : '/mascot/test-deadline'
        await api<void>(path, { method: 'POST', body: JSON.stringify({ season_id: season.id }) })
        return
      }
      await (scope === 'admin' ? api : memberApi)<void>('/mascot', {
        method: 'POST', body: JSON.stringify({ ...action, season_id: season.id, round: season.round }),
      })
    },
    onSettled: async (_, error) => {
      if (!error || error instanceof ApiError && [403, 404, 409].includes(error.status)) {
        await client.invalidateQueries({ queryKey: ['mascot'] })
      }
    },
  })
}
