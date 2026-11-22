import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { memberApi, type MemberProfile } from '../../../shared/api'
import { ErrorState, Loading } from '../../../shared/components'
import { MemberModal } from '../MemberModal'
import type { RegistrationProfile } from './model'

function BinaryQuestion({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: boolean | null
  onChange: (value: boolean) => void
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="member-binary">
        {[true, false].map((answer) => (
          <label key={String(answer)}>
            <input
              type="radio"
              name={name}
              checked={value === answer}
              required
              onChange={() => onChange(answer)}
            />
            {answer ? 'Да' : 'Нет'}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RegistrationForm({
  profile,
  busy,
  onSave,
}: {
  profile: MemberProfile
  busy: boolean
  onSave: (data: RegistrationProfile) => void
}) {
  const [name, setName] = useState(profile.full_name ?? '')
  const [citizen, setCitizen] = useState(profile.is_russian_citizen)
  const [student, setStudent] = useState(profile.is_itmo_student)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || name.trim().length < 2 || citizen == null || student == null) return
    onSave({ full_name: name.trim(), is_russian_citizen: citizen, is_itmo_student: student })
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      <label>
        ФИО
        <input
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={160}
          required
        />
      </label>
      <BinaryQuestion
        label="Вы гражданин РФ?"
        name="citizen"
        value={citizen}
        onChange={setCitizen}
      />
      <BinaryQuestion
        label="Вы учитесь в ИТМО?"
        name="student"
        value={student}
        onChange={setStudent}
      />
      <button
        className="button primary"
        disabled={busy || name.trim().length < 2 || citizen == null || student == null}
      >
        Сохранить и зарегистрироваться
      </button>
    </form>
  )
}

export function RegistrationDialog({
  onClose,
  onSave,
  busy,
  error,
}: {
  onClose: () => void
  onSave: (data: RegistrationProfile) => void
  busy: boolean
  error: Error | null
}) {
  const profile = useQuery({
    queryKey: ['member', 'profile'],
    queryFn: ({ signal }) => memberApi<MemberProfile>('/profile', { signal }),
  })
  return (
    <MemberModal title="Регистрация на мероприятие" onClose={onClose} large busy={busy}>
      {profile.isPending ? (
        <Loading />
      ) : profile.error ? (
        <ErrorState error={profile.error} retry={() => void profile.refetch()} />
      ) : (
        <RegistrationForm profile={profile.data} busy={busy} onSave={onSave} />
      )}
      {error && <ErrorState error={error} />}
    </MemberModal>
  )
}
