import { Countdown } from '../../shared/Countdown'
import type { Visibility } from './model'

const exchangeDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' })

export function SeasonDeadline({ season }: { season: Visibility }) {
  return <Countdown until={season.confirmed ? undefined : season.registration_until} label="До конца записи">
    <Countdown until={season.exchange_at} label="До итоговой встречи">
      {season.exchange_at && <small className="season-deadline">Обмен {exchangeDate.format(new Date(season.exchange_at))}</small>}
    </Countdown>
  </Countdown>
}
