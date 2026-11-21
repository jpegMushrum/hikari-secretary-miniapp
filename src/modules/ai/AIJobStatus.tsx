import type { AIJob } from '../../shared/api'
import { Status } from '../../shared/components'

export function topicTitle(job: Pick<AIJob, 'id' | 'topic'>) {
  const topic = job.topic
  return String(
    topic?.title || topic?.title_ru || topic?.theme || topic?.topic || 'Материал #' + job.id,
  )
}

export function GenerationStatus({ job }: { job: AIJob }) {
  return (
    <Status value={job.status} label={job.status === 'scheduled' ? 'Подготовлено' : undefined} />
  )
}

export function PublicationStatus({ job }: { job: AIJob }) {
  if (!job.publication_status) {
    const unknown = job.publication_id != null || job.status === 'scheduled'
    return <span className="muted">{unknown ? 'Нет данных' : 'Не опубликовано'}</span>
  }
  return (
    <Status
      value={job.publication_status}
      label={job.publication_status === 'failed' ? 'Ошибка доставки' : undefined}
    />
  )
}
