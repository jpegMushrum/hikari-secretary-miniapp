import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { memberApi, type MemberProfile } from '../../shared/api'
import { ErrorState, Loading, PageHeader } from '../../shared/components'
import './member.css'

const profileKey = ['member', 'profile']

function ProfileFields({ profile }: { profile: MemberProfile }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Partial<MemberProfile>>({})
  const values = { ...profile, ...draft }
  const save = useMutation({
    mutationFn: () => memberApi('/profile', {
      method: 'PUT',
      body: JSON.stringify({
        full_name: values.full_name?.trim(),
        is_russian_citizen: !!values.is_russian_citizen,
        is_itmo_student: !!values.is_itmo_student,
      }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: profileKey })
      void client.invalidateQueries({ queryKey: ['member', 'event'] })
      setDraft({})
    },
  })
  const preference = useMutation({
    mutationFn: (enabled: boolean) => memberApi('/profile', {
      method: 'PATCH', body: JSON.stringify({ feedback_enabled: enabled }),
    }),
    onSuccess: (_, enabled) => {
      client.setQueryData<MemberProfile>(profileKey, current =>
        current && { ...current, feedback_enabled: enabled })
    },
  })
  const busy = save.isPending || preference.isPending
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!busy && (values.full_name?.trim().length ?? 0) >= 2) save.mutate()
  }
  return (
    <div className="member-profile">
      <form className="member-form" onSubmit={submit}>
        <fieldset className="member-profile-fields" disabled={save.isPending}>
          <label>ФИО
            <input value={values.full_name ?? ''} autoComplete="name" required minLength={2} maxLength={160}
              onChange={event => setDraft({ ...draft, full_name: event.target.value })} />
          </label>
          <label className="member-checkbox">
            <input type="checkbox" checked={!!values.is_russian_citizen}
              onChange={event => setDraft({ ...draft, is_russian_citizen: event.target.checked })} />
            Я гражданин РФ
          </label>
          <label className="member-checkbox">
            <input type="checkbox" checked={!!values.is_itmo_student}
              onChange={event => setDraft({ ...draft, is_itmo_student: event.target.checked })} />
            Я учусь в ИТМО
          </label>
        </fieldset>
        <div className="button-row">
          <button className="button primary" disabled={busy || !Object.keys(draft).length || (values.full_name?.trim().length ?? 0) < 2}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
          {save.isSuccess && !Object.keys(draft).length && <span className="muted" role="status">Профиль сохранён</span>}
        </div>
        {save.error && <ErrorState error={save.error} />}
      </form>
      <div className="member-preference">
        <button type="button" role="switch" aria-checked={profile.feedback_enabled}
          aria-label="Предлагать оставить отзыв после встречи" disabled={busy}
          onClick={() => preference.mutate(!profile.feedback_enabled)}>
          <span>Предлагать оставить отзыв после встречи
            <small>{profile.feedback_enabled ? 'Включено' : 'Выключено'}</small>
          </span>
          <span className="member-switch" aria-hidden="true" />
        </button>
        {preference.error && <ErrorState error={preference.error} />}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const profile = useQuery({
    queryKey: profileKey,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => memberApi<MemberProfile>('/profile', { signal }),
  })
  return (
    <>
      <PageHeader title="Мой профиль" />
      {profile.isPending ? <Loading /> : profile.error
        ? <ErrorState error={profile.error} retry={() => void profile.refetch()} />
        : <ProfileFields profile={profile.data} />}
    </>
  )
}
