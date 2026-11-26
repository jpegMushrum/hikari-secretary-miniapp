import { type ReactNode, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Monitor } from 'lucide-react'
import { PageHeader, ErrorState, Loading } from '../../shared/components'
import { ApiError } from '../../shared/api'
import { MemberModal } from '../member/MemberModal'
import { TelegramLink } from '../../shared/TelegramLink'
import { EntryPreview } from './Entries'
import { Results } from './Results'
import { firstClosedDate, formatLastSubmissionMinute } from './deadline'
import { type Action, type View, phaseLabel, useMascotActions, useMascotView } from './model'
import './mascot.css'

function PersonContact({ name, username, telegramID }: { name: string; username?: string; telegramID?: number }) {
  return <span className="mascot-person"><span>{name}</span>
    {telegramID != null && <TelegramLink id={telegramID} username={username ?? null} />}
  </span>
}

type Confirm = { title: string; explanation: ReactNode; button: string; command: Action }

export default function AdminMascot() {
  const query = useMascotView('admin')
  const local = useOutletContext<{ local: boolean } | null>()?.local === true
  if (query.isPending) return <Loading />
  if (query.error && (!query.data || query.error instanceof ApiError && query.error.status < 500)) {
    return query.error instanceof ApiError && query.error.status === 404 ? <PageHeader title="Активного сезона нет" /> : <ErrorState error={query.error} retry={() => void query.refetch()} />
  }
  const view = query.data
  return <AdminPhase key={[view.season.id, view.season.phase, view.season.round].join(':')} view={view} local={local} />
}

function AdminPhase({ view, local }: { view: View; local: boolean }) {
  const { season, entries, voters, finalists, rounds } = view
  const { phase, round, winner_id: winnerID } = season
  const action = useMascotActions('admin', season)
  const busy = action.isPending
  const [lastDay, setLastDay] = useState('')
  const [confirmation, setConfirmation] = useState<Confirm | null>(null)
  const [selected, setSelected] = useState<number[]>(finalists)
  const [winner, setWinner] = useState<number | ''>('')
  const approved = entries.filter(entry => entry.approved)
  const ready = voters.filter(person => !person.excluded)
  function confirm(title: string, explanation: ReactNode, button: string, command: Action) {
    action.reset()
    setConfirmation({ title, explanation, button, command })
  }
  const name = (id: number) => entries.find(entry => entry.id === id)?.name ?? rounds.flatMap(r => r.rows).find(row => row.entry_id === id)?.name ?? ('Заявка ' + id)
  const betweenRounds = phase === 'results' && winnerID == null && finalists.length > 1
  const inRunoff = round > 1 && (phase === 'readiness' || phase === 'voting')
  return <article className="mascot-page">
    <PageHeader title="Выборы маскота" />
    <section className="mascot-section">
      <small className="muted">Сезон №{season.id}</small>
      <h2>{phaseLabel[phase]}{round > 0 && (phase === 'readiness' || phase === 'voting') && ', тур ' + round}</h2>
      {phase === 'preparation' && <form className="mascot-form" onSubmit={e => { e.preventDefault(); action.mutate({ action: 'open', deadline: firstClosedDate(lastDay) }) }}>
        <label>Последний день приёма концептов<input required type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} /></label>
        <small className="muted">В этот день можно подать концепт до 23:59 МСК включительно.</small>
        <button className="button primary" disabled={busy || !lastDay}>Открыть приём заявок</button>
      </form>}
      {phase === 'submissions' && <>
        {season.deadline && <p>Приём до {formatLastSubmissionMinute(season.deadline)}</p>}
        {local && <button className="button secondary" disabled={busy}
          onClick={() => confirm('Завершить тестовый приём?', 'Тестовый сезон перейдёт к модерации. Редактирование работ завершится.', 'Завершить приём', { action: 'test_deadline' })}>Завершить тестовый приём</button>}
      </>}
      {phase === 'moderation' && <p className="muted">Допущено работ: {approved.length} из {entries.length}</p>}
      {phase === 'readiness' && <>
        <p>Подтвердили готовность: {ready.length}</p>
        <ul className="mascot-voters">{voters.map(person => <li key={person.person_id}>
          <PersonContact name={person.name} username={person.username} telegramID={person.telegram_id} />{person.excluded ? <small>Исключён</small> : <button className="text-button" disabled={busy}
            onClick={() => confirm('Исключить из тура?', <><PersonContact name={person.name} username={person.username} telegramID={person.telegram_id} /> не сможет проголосовать в этом туре.</>, 'Исключить', { action: 'exclude', person_id: person.person_id })}>Исключить</button>}
        </li>)}</ul>
        <button className="button primary" disabled={busy || !ready.length}
          onClick={() => confirm('Начать голосование?', 'После старта новые голосующие присоединиться к туру не смогут.', 'Начать тур', { action: 'start' })}>Начать голосование</button>
      </>}
      {phase === 'voting' && <button className="button secondary" disabled={busy}
        onClick={() => confirm('Закончить голосование досрочно?', 'В зачёт войдут все уже полученные ответы, в том числе из незавершённых бюллетеней.', 'Закончить тур', { action: 'finish' })}>Закончить голосование досрочно</button>}
      {(phase === 'results' || phase === 'published') && <div className="mascot-section">
        <div className="button-row">
          <Link className="button secondary" to="/admin/mascot/screen"><Monitor size={18} aria-hidden="true" />Открыть итоги для проектора</Link>
          {phase === 'results' && winnerID != null && <button className="button primary" disabled={busy}
            onClick={() => confirm('Опубликовать итоги?', 'Участники увидят победителя и диаграмму каждого тура.', 'Показать итоги', { action: 'publish' })}>Показать результаты участникам</button>}
        </div>
        <small className="muted">Режим проектора показывает итоги на этом устройстве. Публикацией для участников вы управляете отдельно.</small>
      </div>}
    </section>
    {(phase === 'moderation' || phase === 'submissions') && <section className="mascot-section">
      <h2>Заявки</h2>
      {!entries.length && <p className="muted">Пока нет заявок.</p>}
      {entries.map(entry => <EntryPreview key={entry.id} scope="admin" entry={entry} meta={<>
        {entry.author && <PersonContact name={entry.author} username={entry.author_username} telegramID={entry.author_telegram_id} />}
        {entry.approved && <span className="status-positive">Допущен</span>}
      </>}>
        {phase === 'moderation' && <button className="button secondary" disabled={busy} onClick={() => action.mutate({ action: 'moderate', entry_id: entry.id, approved: !entry.approved })}>
          {entry.approved ? 'Снять допуск' : 'Допустить к голосованию'}
        </button>}
      </EntryPreview>)}
      {phase === 'moderation' && <button className="button primary" disabled={busy || !approved.length}
        onClick={() => confirm('Завершить модерацию?', approved.length === 1
          ? 'Единственная допущенная работа «' + approved[0].name + '» станет победителем.'
          : 'Участники смогут подтвердить готовность. Изменение списка работ завершится.',
          approved.length === 1 ? 'Завершить модерацию' : 'Открыть сбор', { action: 'collect' })}>
        {approved.length === 1 ? 'Завершить модерацию' : 'Открыть сбор голосующих'}
      </button>}
    </section>}
    {(phase === 'results' || phase === 'published') && <Results scope="admin" seasonID={season.id} entries={entries} winnerID={winnerID} rounds={rounds} />}
    {betweenRounds && <section className="mascot-form">
      <h2>Следующий тур</h2>
      <fieldset><legend>Кого включить из лидеров?</legend>
        {finalists.map(id => <label key={id} className="mascot-check">
          <input type="checkbox" checked={selected.includes(id)} onChange={e =>
            setSelected(previous => e.target.checked ? [...previous, id] : previous.filter(item => item !== id))} />{name(id)}
        </label>)}
      </fieldset>
      <button type="button" className="button primary" disabled={busy || selected.length < 2}
        onClick={() => action.mutate({ action: 'runoff', entry_ids: selected })}>Открыть сбор на тур {round + 1}</button>
    </section>}
    {(betweenRounds || inRunoff) && <section className="mascot-form">
      <label>Победитель по решению организатора<select value={winner} onChange={e => setWinner(e.target.value ? Number(e.target.value) : '')}>
        <option value="">Выберите маскота</option>{finalists.map(id => <option key={id} value={id}>{name(id)}</option>)}
      </select></label>
      <button className="button secondary" disabled={busy || winner === ''} onClick={() => {
        if (winner !== '') confirm('Утвердить победителя?', (inRunoff ? 'Текущий тур будет отменён. ' : '') + 'Победитель — ' + name(winner) + '. Результаты можно будет объявить отдельно.', 'Утвердить', { action: 'choose', entry_id: winner })
      }}>Утвердить победителя вручную</button>
    </section>}
    {local && <div><button type="button" className="text-button" disabled={busy}
      onClick={() => confirm('Перезапустить выборы маскота?', 'Текущий тестовый сезон закроется. В новом сезоне вы сможете задать дату и открыть приём заявок с нуля.', 'Перезапустить', { action: 'test_reset' })}>
      Перезапустить тестовые выборы
    </button></div>}
    {action.error && !confirmation && <ErrorState error={action.error} />}
    {confirmation && <MemberModal className="mascot-confirmation" title={confirmation.title} busy={busy} onClose={() => setConfirmation(null)}>
      <p>{confirmation.explanation}</p>
      {action.error && <ErrorState error={action.error} />}
      <div className="button-row">
        <button className="button primary" disabled={busy} onClick={() => action.mutate(confirmation.command, { onSuccess: () => setConfirmation(null) })}>{confirmation.button}</button>
        <button className="button secondary" disabled={busy} onClick={() => setConfirmation(null)}>Отмена</button>
      </div>
    </MemberModal>}
  </article>
}
