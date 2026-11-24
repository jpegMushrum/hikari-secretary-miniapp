import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { MemberModal } from '../member/MemberModal'
import { Reveal } from './Reveal'
import { TelegramLink, TelegramMentions } from '../../shared/TelegramLink'
import { ReorderHandle } from '../../shared/ReorderHandle'
import { type AdminView, type Pair, type Participant, giftLabels } from './model'
import './pair-editor.css'

function preferredPair(candidates: Pair[], ready: Set<number>) {
  return candidates.find(pair => !ready.has(pair.giver_id)) ?? candidates[0]
}

function afterExclusion(original: Pair[], excluded: number, ready: Set<number>) {
  const successor = original.find(pair => pair.giver_id === excluded)?.recipient_id
  const remaining = original.filter(pair => pair.giver_id !== excluded)
  const predecessor = remaining.find(pair => pair.recipient_id === excluded)
  if (!predecessor || successor === undefined) return remaining
  if (predecessor.giver_id !== successor) {
    return remaining.map(pair => pair === predecessor ? { ...pair, recipient_id: successor } : pair)
  }

  // The removed person and the survivor used to give to one another.
  // Insert the survivor into another existing pair, preferring an unprepared gift.
  const other = preferredPair(remaining.filter(pair => pair !== predecessor), ready)
  if (!other) return []
  return remaining.map(pair => {
    if (pair === predecessor) return { ...pair, recipient_id: other.recipient_id }
    if (pair === other) return { ...pair, recipient_id: successor }
    return pair
  })
}

function moveRecipient(pairs: Pair[], source: Pair, target: Pair, ready: Set<number>) {
  // If an ordinary swap would make the source giver their own recipient,
  // rotate three assignments. All other givers keep their recipients.
  const third = target.recipient_id === source.giver_id
    ? preferredPair(pairs.filter(pair => pair !== source && pair !== target), ready) : undefined
  return pairs.map(pair => {
    if (pair === target) return { ...pair, recipient_id: source.recipient_id }
    if (pair === source) return { ...pair, recipient_id: third?.recipient_id ?? target.recipient_id }
    if (pair === third) return { ...pair, recipient_id: target.recipient_id }
    return pair
  })
}

function PersonDetail({ text, label, prefix, caption, expanded, toggle }: {
  text: string; caption?: string; label: string; prefix: string; expanded: boolean; toggle: () => void
}) {
  const heading = <span>{label}{caption && <small>{caption}</small>}</span>
  if (!text.trim()) return <div className="santa-person-static">{heading}</div>
  return <details className="santa-person-wishes" open={expanded}>
    <summary aria-label={prefix + ': ' + label} onClick={event => { event.preventDefault(); toggle() }}>
      <ChevronRight size={16} aria-hidden="true" />{heading}
    </summary>
    {expanded && <p className="santa-prose"><TelegramMentions text={text} /></p>}
  </details>
}

export function PairEditor({ view, excluded, busy, close, save, error }: {
  view: AdminView; excluded?: Participant; busy: boolean; close: () => void; save: (pairs: Pair[]) => void; error?: string
}) {
  const assigned = view.season.confirmed
  const editPairs = !excluded || assigned
  const original = view.pairs
  const committed = new Set(view.participants.filter(p => p.gift === 'ready' || p.gift === 'ordered').map(p => p.person_id))
  const [pairs, setPairs] = useState<Pair[]>(() => excluded ? afterExclusion(original, excluded.person_id, committed) : original)
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  function disclosure(key: string) {
    return { expanded: expanded.has(key), toggle: () => setExpanded(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    }) }
  }
  const people = new Map(view.participants.map(p => [p.person_id, p]))
  const names = new Set<string>()
  const duplicates = new Set<string>()
  for (const person of view.participants) {
    if (names.has(person.name)) duplicates.add(person.name)
    names.add(person.name)
  }
  const giverIds = pairs.map(p => String(p.giver_id))
  function name(person: Participant) { return duplicates.has(person.name) ? person.name + ' · ID ' + person.person_id : person.name }
  const previous = new Map(original.map(p => [p.giver_id, people.get(p.recipient_id)!]))
  const activeCount = view.participants.filter(p => p.status !== 'excluded' && p.person_id !== excluded?.person_id).length
  const possible = !editPairs || (pairs.length === activeCount && pairs.length >= 2)
  function move(from: string, to: string) {
    const source = pairs.find(p => p.giver_id === Number(from))
    const target = pairs.find(p => p.giver_id === Number(to))
    if (!source || !target || source === target) return
    if (source.recipient_id === target.giver_id) {
      setNotice('Участник не может дарить себе. Выберите другую строку.')
      return
    }
    setPairs(moveRecipient(pairs, source, target, committed))
    setNotice('')
  }
  const assignments = <>
    <p className="santa-pair-hint">Перетащите подопечного за ручку. Нажмите на имя, чтобы раскрыть пожелания.</p>
    <p className="santa-pair-legend">Жёлтым отмечены дарители, у которых изменился подопечный.</p>
    <div className="santa-assignments" data-reorder-zone>
      <div className="santa-assignment santa-assignment-heading"><span>Даритель</span><span>Подопечный</span></div>
      {pairs.map(pair => {
        const giver = people.get(pair.giver_id)!
        const recipient = people.get(pair.recipient_id)!
        const before = previous.get(giver.person_id)
        const changed = before && before.person_id !== recipient.person_id
        return <div key={giver.person_id} className="santa-assignment" data-changed={changed || undefined}>
          <div>
            <PersonDetail text={assigned ? giver.gift_description : giver.wishes} prefix="Даритель"
              caption={assigned ? 'Подарок: ' + giftLabels[giver.gift] : undefined} label={name(giver)} {...disclosure('giver-' + giver.person_id)} />
          </div>
          <div className="santa-recipient" data-reorder-id={giver.person_id}>
            <div>
              <PersonDetail text={recipient.wishes} prefix={'Подопечный у ' + name(giver)} label={name(recipient)} {...disclosure('recipient-' + recipient.person_id)} />
              {changed && (before.person_id === excluded?.person_id
                ? <div className="santa-former-recipient"><PersonDetail text={before.wishes}
                    label={'Раньше: ' + name(before)} prefix="Пожелания прежнего подопечного" {...disclosure('former-' + before.person_id)} /></div>
                : <small>Раньше: {name(before)}</small>)}
            </div>
            <ReorderHandle id={String(giver.person_id)} label={'Переместить подопечного у ' + name(giver)}
              disabled={busy || pairs.length < 3}
              items={giverIds} skipId={String(recipient.person_id)} move={move} />
          </div>
        </div>
      })}
    </div>
  </>
  return <MemberModal title={excluded ? 'Исключить из обмена: ' + name(excluded) : 'Черновик жеребьёвки'} busy={busy} large className="santa-pair-modal" onClose={close}>
    <div className="santa-pair-body">
      {excluded && <div className="santa-exclusion-person">
        <strong>{name(excluded)}</strong>
        {excluded.telegram_id && <TelegramLink username={excluded.username ?? null} id={excluded.telegram_id} />}
      </div>}
      {editPairs && possible && (excluded ? assignments : <Reveal label="Посмотреть и изменить пары">{assignments}</Reveal>)}
      {!possible && <p role="alert">После исключения для обмена должны остаться хотя бы два участника.</p>}
      {notice && <p className="santa-pair-status" role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="button-row">
      <button type="button" className="button primary" disabled={busy || !possible}
        onClick={() => save(editPairs ? pairs : [])}>{excluded ? 'Подтвердить исключение' : 'Сохранить черновик'}</button>
      <button type="button" className="button secondary" disabled={busy} onClick={close}>Отмена</button>
    </div>
  </MemberModal>
}
