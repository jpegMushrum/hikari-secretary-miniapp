import { useState } from 'react'
import { Shuffle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { ApiError } from '../../shared/api'
import { ErrorState, Loading, PageHeader } from '../../shared/components'
import { dateTime } from '../../shared/format'
import { TelegramLink, TelegramMentions } from '../../shared/TelegramLink'
import { MemberModal } from '../member/MemberModal'
import { SeasonSettings } from './SeasonSettings'
import { PairEditor } from './PairEditor'
import { Reveal } from './Reveal'
import { SantaRoster, statusLabel } from './SantaRoster'
import { type AdminView, type Participant, stateLabels, attendanceLabels, giftLabels, useSanta, useSantaAction } from './model'
import './santa.css'

type Dialog = { kind: 'settings' | 'edit' | 'exclude' | 'confirm' | 'reset' | 'person'; view: AdminView; person?: Participant }

export default function AdminSanta() {
  const client = useQueryClient()
  const local = useOutletContext<{ local: boolean } | null>()?.local === true
  const data = useSanta<AdminView>('admin')
  const action = useSantaAction('admin')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  if (data.isPending) return <Loading />
  if (data.error && (!data.data || (data.error instanceof ApiError && data.error.status < 500))) return data.error instanceof ApiError && data.error.status === 404
    ? <PageHeader title="Активного сезона нет" /> : <ErrorState error={data.error} retry={() => void data.refetch()} />
  const view = data.data
  const { season, pairs, participants } = view
  const busy = action.isPending
  const roster = participants.filter(p => p.status !== 'excluded')
  const nameCounts = new Map<string, number>()
  for (const p of participants) nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1)
  const names = new Map(participants.map(p => [p.person_id, nameCounts.get(p.name) === 1 && p.name
    ? p.name : (p.name || 'Участник') + ' · ID ' + p.person_id]))
  const name = (id: number) => names.get(id) ?? ('ID ' + id)
  function show(kind: Dialog['kind'], person?: Participant) {
    action.reset()
    setDialog({ kind, view, person })
  }
  function close() { action.reset(); setDialog(null) }
  function send(command: string, fields: Record<string, unknown> = {}) {
    const snapshot = dialog?.view.season ?? season
    action.mutate({ season_id: snapshot.id, revision: snapshot.revision, action: command, ...fields },
      { onSuccess: () => {
        const latest = client.getQueryData<AdminView>(['santa', 'admin', 'detail'])
        if (command === 'shuffle' && latest?.season.id === snapshot.id && latest.season.revision > snapshot.revision && latest.pairs.length && !latest.season.confirmed)
          setDialog({ kind: 'edit', view: latest })
        else setDialog(null)
      }, onError: error => {
        if (error instanceof ApiError && error.status === 409) setDialog(null)
      } })
  }
  const modalError = action.error?.message
  const selected = dialog?.kind === 'person' && participants.find(person => person.person_id === dialog.person?.person_id)
  const assignedTo = selected && pairs.find(pair => pair.giver_id === selected.person_id)?.recipient_id
  const recipient = season.confirmed && assignedTo ? participants.find(person => person.person_id === assignedTo) : undefined
  return <article className="santa-page">
    <PageHeader title="Тайный Санта" />
    {data.error && <ErrorState error={data.error} retry={() => void data.refetch()} />}
    <section><div className="santa-heading"><h2>Сезон №{season.id}</h2><span>{stateLabels[season.status]}</span></div>
      <dl className="santa-facts">
        <div><dt>Бюджет</dt><dd>{season.budget || 'Не задан'}</dd></div>
        <div><dt>Запись до</dt><dd>{dateTime(season.registration_until)}</dd></div>
        <div><dt>Обмен подарками</dt><dd>{dateTime(season.exchange_at)}</dd></div>
        <div><dt>Напоминание</dt><dd>За {season.reminder_minutes} мин.</dd></div>
      </dl>
      <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={() => show('settings')}>Настройки сезона</button>
        {(season.status === 'preparation' || season.status === 'paused') &&
          <button type="button" className="button primary" disabled={busy || !season.budget || !season.exchange_at || !season.registration_until}
              onClick={() => send('open')}>{season.status === 'paused' ? 'Возобновить доступ' : 'Открыть участникам'}</button>}
        {local && <button type="button" className="text-button" disabled={busy} onClick={() => show('reset')}>Сбросить тестовый сезон</button>}
      </div>
    </section>
    {!dialog && action.error && <ErrorState error={action.error} />}
    <section>
      <div className="santa-heading"><h2>Участники</h2><span>{roster.length}</span></div>
      {participants.length ? <SantaRoster key={season.id} view={view} open={person => show('person', person)} personName={name} /> : <p className="muted">Заявок пока нет.</p>}
    </section>
    {!season.confirmed && <section><h2>Жеребьёвка</h2>
        {roster.length < 3 && <p className="muted">Для жеребьёвки нужны хотя бы три участника.</p>}
        {pairs.length > 0 && season.status === 'paused' && <p className="muted">Чтобы разослать назначения, возобновите доступ участникам.</p>}
        <div className="button-row">
          <button type="button" className="button secondary" disabled={busy || roster.length < 3}
            onClick={() => send('shuffle')}><Shuffle size={16} />Перемешать</button>
          {!!pairs.length && <>
            <button type="button" className="button secondary" disabled={busy} onClick={() => show('edit')}>Открыть черновик</button>
            <button type="button" className="button primary" disabled={busy || season.status !== 'open'} onClick={() => show('confirm')}>Подтвердить и разослать</button>
          </>}
        </div>
    </section>}
    {selected && <MemberModal title={name(selected.person_id)} onClose={close}>
      <dl className="santa-person-details">
        {selected.telegram_id && <div><dt>Telegram</dt><dd><TelegramLink username={selected.username ?? null} id={selected.telegram_id} /></dd></div>}
        <div><dt>Участие</dt><dd>{statusLabel[selected.status]}</dd></div>
        <div><dt>Пожелания участника</dt><dd className="santa-prose"><TelegramMentions text={selected.wishes} /></dd></div>
        {season.confirmed && <>
          <div><dt>Придёт на обмен</dt><dd>{attendanceLabels[selected.attendance]}</dd></div>
          <div><dt>Готовность подарка</dt><dd>{giftLabels[selected.gift]}</dd></div>
          {selected.gift_description && <div><dt>Подготовленный подарок</dt>
            <dd className="santa-prose"><TelegramMentions text={selected.gift_description} /></dd></div>}
          {recipient && <div><dt>Подопечный</dt><dd>{name(recipient.person_id)}</dd></div>}
        </>}
      </dl>
      {selected.status !== 'excluded' && <button type="button" className="text-button" onClick={() => show('exclude', selected)}>
        Исключить участника</button>}
    </MemberModal>}
    {dialog?.kind === 'settings' && <SeasonSettings season={dialog.view.season} busy={busy} close={close}
      save={value => send('settings', value)} error={modalError} />}
    {(dialog?.kind === 'edit' || dialog?.kind === 'exclude') && <PairEditor view={dialog.view}
      excluded={dialog.person} close={close} busy={busy} error={modalError}
      save={values => dialog.person ? send('exclude', { person_id: dialog.person.person_id, pairs: values }) : send('draft', { pairs: values })} />}
    {(dialog?.kind === 'confirm' || (local && dialog?.kind === 'reset')) && <MemberModal
      title={dialog.kind === 'confirm' ? 'Отправить назначения участникам?' : 'Сбросить тестовый сезон?'} onClose={close} busy={busy}>
      <p className="santa-summary">{dialog.kind === 'confirm'
        ? 'Бот отправит участникам текущие назначения. Повторная жеребьёвка станет недоступна.'
        : `Сезон №${dialog.view.season.id} уйдёт в архив. Новый сезон начнётся с прежними настройками и пустым списком участников. Запись можно будет открыть вручную.`}</p>
      {dialog.kind === 'confirm' && <Reveal label="Посмотреть пары"><ol className="santa-list santa-pairs">{dialog.view.pairs.map(pair => <li key={pair.giver_id}>
        <span>{name(pair.giver_id)}</span><span aria-label="дарит">→</span><strong>{name(pair.recipient_id)}</strong>
      </li>)}</ol></Reveal>}
      {modalError && <p role="alert">{modalError}</p>}
      <div className="button-row">
        <button className="button primary" disabled={busy} onClick={() => send(dialog.kind)}>
          {dialog.kind === 'confirm' ? 'Разослать назначения' : 'Сбросить сезон'}</button>
        <button className="button secondary" disabled={busy} onClick={close}>Отмена</button>
      </div>
    </MemberModal>}
  </article>
}
