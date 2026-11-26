import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MemberModal } from '../member/MemberModal'
import { discardImages } from './model'

export function PendingImages({ keys }: { keys: string[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const client = useQueryClient()
  async function remove() {
    setBusy(true)
    const remaining = await discardImages(selected)
    setFailed(remaining.length > 0)
    setSelected(remaining)
    await client.invalidateQueries({ queryKey: ['mascot', 'member', 'view'] })
    setBusy(false)
  }
  return <>
    {keys.length > 0 && <p><button type="button" className="text-button" disabled={busy} onClick={() => {
      setFailed(false)
      setSelected([...keys])
    }}>Очистить незавершённые загрузки ({keys.length})</button></p>}
    {selected.length > 0 && <MemberModal className="mascot-confirmation" title="Удалить незавершённые загрузки?" busy={busy} onClose={() => setSelected([])}>
      <p>Файлов к удалению: {selected.length}. Если вы сейчас заполняете заявку в другой вкладке, сначала сохраните её.</p>
      {failed && <p role="alert">Часть загрузок не удалось удалить. Можно повторить попытку.</p>}
      <div className="button-row">
        <button type="button" className="button primary" disabled={busy} onClick={() => void remove()}>Удалить загрузки</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setSelected([])}>Отмена</button>
      </div>
    </MemberModal>}
  </>
}
