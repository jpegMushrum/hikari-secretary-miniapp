import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../shared/api'
import { ErrorState } from '../../shared/components'
import { MemberModal } from '../member/MemberModal'
import { moscowInput } from '../../shared/format'

type Schedule = { name: string; weekday: number; start_time: string; end_time: string }
type Template = Schedule & { id: number; revision: number }
type Editor = { action: 'create' } | { action: 'edit' | 'delete'; template: Template }
const path = '/event-templates'
const queryKey = ['event-templates']
const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

function TemplateDialog({
  editor,
  close,
  onSaved,
}: {
  editor: Editor
  close: () => void
  onSaved: () => void
}) {
  const template = editor.action === 'create' ? undefined : editor.template
  const [requestKey] = useState(() => crypto.randomUUID())
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (editor.action === 'delete') {
        await api(path + '/' + editor.template.id + '/delete', {
          method: 'POST',
          body: JSON.stringify({ revision: editor.template.revision }),
        })
        return null
      }
      const fields: Schedule = {
        name: String(form.get('name') ?? '').trim(),
        weekday: Number(form.get('weekday')),
        start_time: String(form.get('start_time') ?? ''),
        end_time: String(form.get('end_time') ?? ''),
      }
      if (!fields.name) throw new Error('Введите название шаблона.')
      if (fields.start_time === fields.end_time)
        throw new Error('Время начала и окончания совпадает.')
      return api<Template>(template ? path + '/' + template.id : path, {
        method: template ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...fields,
          ...(template ? { revision: template.revision } : { request_key: requestKey }),
        }),
      })
    },
    onSuccess: (saved) => {
      client.setQueryData<Template[]>(queryKey, (items = []) => {
        const remaining = items.filter((item) => item.id !== (saved?.id ?? template?.id))
        return saved ? [...remaining, saved] : remaining
      })
      onSaved()
      void client.invalidateQueries({ queryKey })
      close()
    },
    onError: () => {
      void client.invalidateQueries({ queryKey })
    },
  })
  const deleting = editor.action === 'delete'
  const title = deleting ? 'Удалить шаблон?' : template ? 'Редактировать шаблон' : 'Новый шаблон'
  return createPortal(
    <MemberModal title={title} onClose={close} busy={mutation.isPending}>
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          mutation.mutate(new FormData(event.currentTarget))
        }}
      >
        <fieldset className="settings-fields" disabled={mutation.isPending}>
          {deleting ? (
            <p>Удалить шаблон «{template?.name}»?</p>
          ) : (
            <>
              <label>
                Название шаблона
                <input required maxLength={160} name="name" defaultValue={template?.name} />
              </label>
              <label>
                День недели
                <select name="weekday" defaultValue={template?.weekday ?? 6}>
                  {weekdays.map((day, i) => (
                    <option key={day} value={i + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Время начала · Москва
                  <input
                    type="time"
                    required
                    name="start_time"
                    defaultValue={template?.start_time}
                  />
                </label>
                <label>
                  Время окончания · Москва
                  <input type="time" required name="end_time" defaultValue={template?.end_time} />
                </label>
              </div>
            </>
          )}
          <div className="button-row">
            <button className="button primary">{deleting ? 'Удалить' : 'Сохранить шаблон'}</button>
            <button className="button secondary" type="button" onClick={close}>
              Отмена
            </button>
          </div>
        </fieldset>
        {mutation.error && <ErrorState error={mutation.error} />}
      </form>
    </MemberModal>,
    document.body,
  )
}

export function EventScheduleFields({
  title,
  starts,
  ends,
  setTitle,
  setStarts,
  setEnds,
  setBusy,
}: {
  title: string
  starts: string
  ends: string
  setTitle: (value: string) => void
  setStarts: (value: string) => void
  setEnds: (value: string) => void
  setBusy: (value: boolean) => void
}) {
  const templates = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<Template[]>(path, { signal }),
  })
  const [selected, setSelected] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const pending = useRef<AbortController | null>(null)
  const current = templates.data?.find((item) => String(item.id) === selected)
  useEffect(
    () => () => {
      pending.current?.abort()
      setBusy(false)
    },
    [setBusy],
  )

  function cancelApply() {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    setError(null)
  }
  async function choose(value: string) {
    cancelApply()
    if (value === 'new') {
      setEditor({ action: 'create' })
      return
    }
    setSelected(value)
    const item = templates.data?.find((row) => String(row.id) === value)
    if (!item) return
    const request = new AbortController()
    pending.current = request
    setBusy(true)
    try {
      const dates = await api<{ starts_at: string; ends_at: string }>(
        path + '/' + item.id + '/apply',
        {
          method: 'POST',
          body: JSON.stringify({ revision: item.revision }),
          signal: request.signal,
        },
      )
      if (!request.signal.aborted) {
        setStarts(moscowInput(dates.starts_at))
        setEnds(moscowInput(dates.ends_at))
      }
    } catch (error) {
      if (!request.signal.aborted) {
        setSelected('')
        setError(error instanceof Error ? error : new Error('Не удалось применить шаблон.'))
        if (error instanceof ApiError && [404, 409].includes(error.status)) void templates.refetch()
      }
    } finally {
      if (!request.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  return (
    <>
      <div className="schedule-template-controls">
        <label>
          Шаблон
          <select value={current ? selected : ''} onChange={(e) => void choose(e.target.value)}>
            <option value="">Без шаблона</option>
            {templates.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="new">Создать новый шаблон</option>
          </select>
        </label>
        {templates.error && (
          <ErrorState error={templates.error} retry={() => void templates.refetch()} />
        )}
        {error && <ErrorState error={error} />}
        {current && (
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                cancelApply()
                setEditor({ action: 'edit', template: current })
              }}
            >
              Редактировать шаблон
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                cancelApply()
                setEditor({ action: 'delete', template: current })
              }}
            >
              Удалить шаблон
            </button>
          </div>
        )}
      </div>
      {editor && (
        <TemplateDialog
          editor={editor}
          close={() => setEditor(null)}
          onSaved={() => setSelected('')}
        />
      )}
      <label>
        Название мероприятия
        <input required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Начало · Москва
        <input
          required
          type="datetime-local"
          name="starts_at"
          value={starts}
          onChange={(e) => {
            cancelApply()
            setStarts(e.target.value)
          }}
        />
      </label>
      <label>
        Окончание · Москва
        <input
          required
          type="datetime-local"
          name="ends_at"
          value={ends}
          onChange={(e) => {
            cancelApply()
            setEnds(e.target.value)
          }}
        />
      </label>
    </>
  )
}
