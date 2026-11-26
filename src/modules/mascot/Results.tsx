import { useState } from 'react'
import { ErrorState, Loading } from '../../shared/components'
import { MemberModal } from '../member/MemberModal'
import { EntryCard } from './Entries'
import { useResultConcept, type Scope, type View } from './model'

const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const ticks = [0, 25, 50, 75, 100]

type Selection = { id: number; name: string }

function ResultConcept({ entry, scope, seasonID, close }: { entry: Selection; scope: Scope; seasonID: number; close: () => void }) {
  const query = useResultConcept(scope, seasonID, entry.id)
  return <MemberModal large title={entry.name} onClose={close}>
    {query.isPending ? <Loading /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} />
      : <EntryCard entry={query.data} scope={scope} showTitle={false} />}
  </MemberModal>
}

export function Results({ rounds, winnerID, entries, scope, seasonID }: {
  rounds: View['rounds']; winnerID: number | null; entries: View['entries']; scope: Scope; seasonID: number
}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const winner = winnerID && (rounds.flatMap(round => round.rows).find(row => row.entry_id === winnerID)
    ?? entries.find(entry => entry.id === winnerID))
  function conceptButton(id: number, name: string) {
    return <button type="button" className="mascot-result-link" aria-label={'Открыть концепт «' + name + '»'}
      onClick={() => setSelected({ id, name })}>{name}</button>
  }
  return <section className="mascot-results">
    {winnerID != null && winner && <h2>Победитель — {conceptButton(winnerID, winner.name)}</h2>}
    {rounds.length > 0 && <p className="mascot-chart-key">Места по числу лайков. Полосы показывают долю лайков среди ответов.</p>}
    {rounds.map(round => <section key={round.number}>
      <h2>{round.number} тур{round.cancelled ? ' (отменён)' : ''}</h2>
      <table className="mascot-chart" aria-label={'Итоги тура ' + round.number}>
        <colgroup><col className="mascot-rank-col" /><col /><col className="mascot-name-col" /></colgroup>
        <thead><tr><th id={`rank-${round.number}`} scope="col" aria-label="Место" />
          <th id={`likes-${round.number}`} scope="col" aria-label="Доля лайков"><div className="mascot-axis" aria-hidden="true">
            {ticks.map(value => <span key={value} style={{ left: value + '%' }}>{value}%</span>)}
          </div></th>
          <th scope="col">Маскот</th></tr></thead>
        <tbody>{round.rows.map(row => <tr key={row.entry_id}>
          <td headers={`concept-${round.number}-${row.entry_id} rank-${round.number}`}>{row.place}</td>
          <td headers={`concept-${round.number}-${row.entry_id} likes-${round.number}`} className="mascot-plot" aria-label={row.percent == null ? 'Нет ответов' : percent.format(row.percent) + ' %'}>
            <div className="mascot-bar" aria-hidden="true" style={{ width: (row.percent ?? 0) + '%' }} />
          </td><th id={`concept-${round.number}-${row.entry_id}`} scope="row">{conceptButton(row.entry_id, row.name)}
            <small className="mascot-score" aria-hidden="true">{row.percent == null ? '—' : percent.format(row.percent) + ' %'}</small>
          </th>
        </tr>)}</tbody>
      </table>
    </section>)}
    {selected && <ResultConcept entry={selected} scope={scope} seasonID={seasonID} close={() => setSelected(null)} />}
  </section>
}
