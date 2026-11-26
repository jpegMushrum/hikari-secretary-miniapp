import { useState } from 'react'
import { Heart } from 'lucide-react'
import { ApiError } from '../../shared/api'
import { PageHeader, ErrorState, Loading } from '../../shared/components'
import { MemberModal } from '../member/MemberModal'
import { EntryCard, EntryPreview, EntryForm } from './Entries'
import { PendingImages } from './PendingImages'
import { Results } from './Results'
import { formatLastSubmissionMinute } from './deadline'
import { useMascotView, useMascotActions, type Entry, type View } from './model'
import './mascot.css'

export default function MemberMascot() {
  const query = useMascotView('member')
  if (query.isPending) return <Loading />
  if (query.error && (!query.data || query.error instanceof ApiError && query.error.status < 500)) {
    return query.error instanceof ApiError && query.error.status === 404 ? <PageHeader title="Сейчас конкурс недоступен" /> : <ErrorState error={query.error} retry={() => void query.refetch()} />
  }
  const view = query.data
  return <MemberPhase key={[view.season.id, view.season.phase, view.season.round].join(':')} view={view} />
}

function MemberPhase({ view }: { view: View }) {
  const { season, entries, card } = view
  const action = useMascotActions('member', season)
  const [editor, setEditor] = useState<Entry | 'new' | null>(null)
  const [withdraw, setWithdraw] = useState<Entry | null>(null)
  return <article className="mascot-page">
    <PageHeader title="Выборы маскота" />
    {season.phase === 'submissions' && <>
      <section className="mascot-section">
        <h2>Мои концепты</h2>
        <p className="muted">Возможно подать до 2 концептов.</p>
        {season.deadline && <p className="muted">Приём до {formatLastSubmissionMinute(season.deadline)}</p>}
        {entries.map(entry => <EntryPreview key={entry.id} entry={entry} scope="member">
          <div className="button-row">
            <button className="button secondary" disabled={!!editor || !view.eligible} onClick={() => { action.reset(); setEditor(entry) }}>Редактировать</button>
            <button className="text-button" disabled={!!editor} onClick={() => { action.reset(); setWithdraw(entry) }}>Отозвать заявку</button>
          </div>
        </EntryPreview>)}
        {!view.eligible && <p>Для подачи концепта нужно посетить встречу клуба или зарегистрироваться на предстоящую.</p>}
        {view.eligible && !editor && entries.length < 2 && <button className="button primary" onClick={() => { action.reset(); setEditor('new') }}>Подать концепт</button>}
        {!editor && <PendingImages keys={view.pending_images ?? []} />}
      </section>
      {editor && <EntryForm key={editor === 'new' ? 'new' : editor.id} entry={editor === 'new' ? undefined : editor}
        seasonID={season.id} eligible={view.eligible} busy={action.isPending} send={action.mutateAsync} close={() => setEditor(null)} />}
      {withdraw && <MemberModal className="mascot-confirmation" title={'Отозвать «' + withdraw.name + '»?'} busy={action.isPending} onClose={() => setWithdraw(null)}>
        <p>До конца приёма можно подать новую заявку.</p>
        {action.error && <ErrorState error={action.error} />}
        <div className="button-row">
          <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ action: 'withdraw', entry_id: withdraw.id }, { onSuccess: () => { setEditor(null); setWithdraw(null) } })}>Да, отозвать</button>
          <button className="button secondary" disabled={action.isPending} onClick={() => setWithdraw(null)}>Оставить</button>
        </div>
      </MemberModal>}
    </>}
    {season.phase === 'moderation' && <p>Приём завершён. Организаторы проверяют заявки.</p>}
    {season.phase === 'readiness' && <section className="mascot-section">
      <h2>Сбор голосующих, тур {season.round}</h2>
      {view.ready ? <p role="status"><span className="status-positive">Готовность подтверждена.</span> Ждём начала голосования.</p>
        : view.can_ready ? <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ action: 'ready' })}>Я готов</button>
          : <p>Участие в этом туре недоступно.</p>}
    </section>}
    {season.phase === 'voting' && <section className="mascot-section">
      {card ? <>
        <p className="muted">Осталось карточек: {view.remaining}</p>
        <EntryCard key={card.id} entry={card} scope="member" />
        <div className="button-row mascot-vote">
          <button className="button secondary" disabled={action.isPending} onClick={() => action.mutate({ action: 'vote', entry_id: card.id, like: false })}>Пропустить</button>
          <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ action: 'vote', entry_id: card.id, like: true })}><Heart size={18} aria-hidden="true" />Нравится</button>
        </div>
      </> : <p>{view.ready ? 'Вы оценили все карточки. Ожидаем завершения тура.' : 'Голосование уже началось. Состав участников зафиксирован.'}</p>}
    </section>}
    {season.phase === 'results' && <p>Голосование завершено. Ожидаем объявления результатов.</p>}
    {season.phase === 'published' && <Results scope="member" seasonID={season.id} entries={entries} winnerID={season.winner_id} rounds={view.rounds} />}
    {action.error && !withdraw && <ErrorState error={action.error} />}
  </article>
}
