import { useState, type FormEvent } from 'react'
import { ApiError } from '../../shared/api'
import { dateTime } from '../../shared/format'
import { ErrorState, Loading, PageHeader } from '../../shared/components'
import { TelegramLink, TelegramMentions } from '../../shared/TelegramLink'
import { MemberModal } from '../member/MemberModal'
import { attendanceLabels, giftLabels, useSanta, useSantaAction, wishesLabel, type MemberView } from './model'
import './santa.css'

function WishesForm({ initial, joining = false, busy, save }: { initial: string; joining?: boolean; busy: boolean; save: (text: string) => void }) {
  const [text, setText] = useState(initial)
  const canSave = !!text.trim() && (joining || text.trim() !== initial)
  function submit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (canSave && !busy) save(value)
  }
  return <form className="santa-form" onSubmit={submit}>
    <label>{joining ? wishesLabel : <small className="muted">Напишите, что бы вы хотели получить и что точно не стоит дарить.</small>}
      <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} required rows={3} />
    </label>
    <button className={'button ' + (joining ? 'primary' : 'secondary')} disabled={busy || !canSave}>
      {joining ? 'Подтвердить участие' : 'Сохранить пожелания'}
    </button>
  </form>
}

function GiftDescriptionForm({ initial, busy, save }: { initial: string; busy: boolean; save: (value: string) => void }) {
  const [description, setDescription] = useState(initial)
  const value = description.trim()
  const tooLong = Array.from(value).length > 2000
  return <form className="santa-form" onSubmit={event => {
    event.preventDefault()
    if (!busy && !tooLong && value !== initial) save(value)
  }}>
    <label>Подготовленный подарок
      <textarea value={description} onChange={event => setDescription(event.target.value)}
        rows={3} aria-invalid={tooLong} aria-describedby={tooLong ? 'gift-description-error gift-description-hint' : 'gift-description-hint'} />
    </label>
    <small id="gift-description-hint" className="muted">Заполните на случай, если ваш подопечный не сможет прийти и забрать подарок. Это поможет организаторам подобрать другого получателя.</small>
    {tooLong && <small id="gift-description-error" role="alert">Сократите описание до 2000 символов.</small>}
    <button className="button secondary" disabled={busy || tooLong || value === initial}>Сохранить описание</button>
  </form>
}

export default function MemberSanta() {
  const detail = useSanta<MemberView>('member')
  const action = useSantaAction('member')
  const [exitPrompt, setExitPrompt] = useState<{ seasonId: number; action: 'cancel' | 'request_exit' } | null>(null)
  if (detail.isPending) return <Loading />
  if (detail.error) return detail.error instanceof ApiError && detail.error.status === 404
    ? <PageHeader title="Сейчас сезон недоступен" /> : <ErrorState error={detail.error} retry={() => void detail.refetch()} />
  const { season, participation: person, recipient } = detail.data
  const selectedGift = person?.gift === 'unknown' ? 'not_ready' : person?.gift
  const confirmExit = exitPrompt?.seasonId === season.id ? exitPrompt.action : null
  const signupOpen = !season.confirmed && !!season.registration_until && Date.parse(season.registration_until) > Date.now()
  const busy = action.isPending
  function send(name: string, fields: Record<string, unknown> = {}) {
    action.mutate({ action: name, season_id: season.id, ...fields })
  }
  return <article className="santa-page">
    <PageHeader title="Тайный Санта" />
    <dl className="santa-facts santa-member-facts">
      <div><dt>Бюджет</dt><dd>{season.budget}</dd></div>
      <div><dt>Запись до</dt><dd>{dateTime(season.registration_until)} МСК</dd></div>
      <div><dt>Обмен подарками</dt><dd>{dateTime(season.exchange_at)} МСК</dd></div>
    </dl>
    {action.error && <ErrorState error={action.error} />}
    {action.isSuccess && <p className="muted" role="status">Изменения сохранены</p>}
    {!person ? signupOpen
      ? <section><h2>Участие в обмене</h2><WishesForm key={season.id} initial={detail.data.draft_wishes ?? ''} joining busy={busy} save={wishes => send('join', { wishes })} /></section>
      : <p>Запись на этот обмен завершена.</p>
      : person.status === 'excluded' ? <p>Вы исключены из этого обмена.</p> : <>
        {recipient && <section><h2>Подопечный</h2>
          <p className="santa-recipient-contact">{recipient.name}{' '}
            {recipient.telegram_id > 0 && <TelegramLink username={recipient.username} id={recipient.telegram_id} />}
          </p>
          <blockquote className="santa-wish-quote santa-prose">
            <TelegramMentions text={recipient.wishes} />
          </blockquote>
        </section>}
        <section><h2>Мои пожелания</h2>
          <WishesForm key={season.id + ':' + person.wishes} initial={person.wishes} busy={busy} save={wishes => send('wishes', { wishes })} />
        </section>
        {season.confirmed && <section><h2>Придёте на обмен?</h2>
          <div className="button-row" role="group" aria-label="Присутствие на обмене">
            {(['yes', 'no'] as const).map(value => <button key={value} type="button" className="button secondary"
              aria-pressed={person.attendance === value} disabled={busy || person.attendance === value}
              onClick={() => send('attendance', { attendance: value })}>
              {value === 'yes' && person.attendance === 'no' ? 'Всё-таки приду' : attendanceLabels[value]}</button>)}
          </div>
          {person.attendance === 'no' && <p className="muted">Организаторы уведомлены. Вы продолжаете участвовать в обмене.</p>}
        </section>}
        {recipient && <section><h2>Подарок готов?</h2>
          <div className="button-row" role="group" aria-label="Готовность подарка">
            {(['ready', 'ordered', 'not_ready'] as const).map(value => <button type="button" className="button secondary"
              aria-pressed={selectedGift === value} key={value} disabled={busy || selectedGift === value}
              onClick={() => send('gift', { gift: value, recipient_id: recipient.person_id })}>{giftLabels[value]}</button>)}
          </div>
        </section>}
        {recipient && <section><GiftDescriptionForm
          key={[season.id, recipient.person_id, person.gift_description].join(':')}
          initial={person.gift_description ?? ''} busy={busy}
          save={gift_description => send('gift_description', { recipient_id: recipient.person_id, gift_description })} />
        </section>}
        {(signupOpen || season.confirmed) && <section>
          {person.status === 'exit_requested' && <p role="status">Запрос на выход отправлен организаторам. Пока он рассматривается, назначение действует.</p>}
          <button type="button" className="text-button" disabled={busy}
            onClick={() => person.status === 'exit_requested' ? send('retract_exit') : setExitPrompt({ seasonId: season.id, action: season.confirmed ? 'request_exit' : 'cancel' })}>
            {!season.confirmed ? 'Отменить участие' : person.status === 'exit_requested' ? 'Отозвать запрос' : 'Запросить выход'}
          </button>
        </section>}
      </>}
    {confirmExit && person && person.status === 'active' && ((confirmExit === 'cancel' && signupOpen) || (confirmExit === 'request_exit' && season.confirmed)) &&
      <MemberModal title={confirmExit === 'cancel' ? 'Отменить участие?' : 'Запросить выход?'} onClose={() => setExitPrompt(null)} busy={busy}>
        <p>{confirmExit === 'cancel' ? 'Ваши пожелания сохранятся. До конца записи можно присоединиться снова.' : 'Организаторы получат запрос. Вы сможете отозвать его, пока организатор не подтвердит исключение.'}</p>
        {action.error && <ErrorState error={action.error} />}
        <div className="button-row">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setExitPrompt(null)}>Остаться</button>
          <button type="button" className="button primary" disabled={busy}
            onClick={() => action.mutate({ action: confirmExit, season_id: season.id }, { onSuccess: () => setExitPrompt(null) })}>
            {confirmExit === 'cancel' ? 'Да, отменить участие' : 'Отправить запрос'}
          </button>
        </div>
      </MemberModal>}
  </article>
}
