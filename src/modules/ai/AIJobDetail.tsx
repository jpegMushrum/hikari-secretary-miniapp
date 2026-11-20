import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicationPreview } from '../publications/PublicationPreview'
import { api, type AIJob, type Publication } from '../../shared/api'
import { BackLink, ErrorState, Loading, PageHeader } from '../../shared/components'
import { dateTime } from '../../shared/format'
import { GenerationStatus, PublicationStatus, topicTitle } from './AIJobStatus'

export default function AIJobDetail() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['ai-job', id],
    queryFn: ({ signal }) => api<AIJob>('/ai/history/' + id, { signal }),
    refetchInterval: ({ state: { data } }) => {
      if (!data) return false
      return ['pending', 'generating', 'retry'].includes(data.status) ||
        data.publication_status === 'scheduled'
        ? 3000
        : false
    },
  })
  useEffect(() => {
    document.documentElement.scrollTop = 0
  }, [id])
  const job = query.data
  useEffect(() => {
    if (job) void client.invalidateQueries({ queryKey: ['/ai/history'] })
  }, [client, job])
  return (
    <>
      {location.state?.from ? (
        <button type="button" className="text-button back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> К истории тем
        </button>
      ) : (
        <BackLink to="/admin/ai">К истории тем</BackLink>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        job && (
          <>
            <PageHeader title="Предпросмотр публикации" />
            <div className="topic-meta">
              <span>
                Генерация · <GenerationStatus job={job} />
              </span>
              <span>
                Публикация · <PublicationStatus job={job} />
              </span>
              <span>По плану · {dateTime(job.scheduled_for)}</span>
            </div>
            {job.last_error && <p className="notice error">{job.last_error}</p>}
            <div className="topic-detail">
              {job.publication_id != null ? (
                <JobPublication id={job.publication_id} />
              ) : job.topic ? (
                <>
                  <h2>Сохранённый материал</h2>
                  <p>{topicTitle(job)}</p>
                  {typeof job.topic.introduction === 'string' && <p>{job.topic.introduction}</p>}
                  <Material job={job} />
                </>
              ) : (
                <p className="muted">Материал ещё не сформирован.</p>
              )}
            </div>
          </>
        )
      )}
    </>
  )
}

function JobPublication({ id }: { id: number }) {
  const publication = useQuery({
    queryKey: ['publication', String(id)],
    queryFn: ({ signal }) => api<Publication>('/publications/' + id, { signal }),
    refetchOnMount: 'always',
  })
  if (publication.isPending) return <Loading />
  if (publication.error)
    return <ErrorState error={publication.error} retry={() => void publication.refetch()} />
  return <PublicationPreview publication={publication.data} />
}

function Material({ job }: { job: AIJob }) {
  const topic = job.topic
  if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return <Topic value={topic} />

  const sections = [
    ['questions', 'Вопросы'],
    ['vocabulary', 'Лексика'],
    ['grammar', 'Грамматика'],
  ] as const
  const shown = new Set<string>(sections.map(([key]) => key))
  for (const key of ['title_ru', 'title', 'theme', 'topic']) {
    if (topic[key] === topicTitle(job)) shown.add(key)
  }
  if (typeof topic.introduction === 'string') shown.add('introduction')
  const hasVocabularyTheme = typeof topic.vocabulary_theme === 'string' && topic.vocabulary != null
  if (hasVocabularyTheme) shown.add('vocabulary_theme')
  const extra = Object.fromEntries(Object.entries(topic).filter(([key]) => !shown.has(key)))
  return (
    <>
      {sections.map(
        ([key, label]) =>
          topic[key] != null && (
            <section key={key} className="topic-section">
              <h2>{label}</h2>
              {key === 'vocabulary' && hasVocabularyTheme && (
                <p>{String(topic.vocabulary_theme)}</p>
              )}
              <Topic value={topic[key]} />
            </section>
          ),
      )}
      {Object.keys(extra).length > 0 && <Topic value={extra} />}
    </>
  )
}

function Topic({ value }: { value: unknown }) {
  if (value == null) return <p className="muted">Материал ещё не сформирован.</p>
  if (typeof value === 'string' || typeof value === 'number')
    return <p className="prose">{String(value)}</p>
  if (Array.isArray(value))
    return (
      <ul className="topic-list">
        {value.map((v, i) => (
          <li key={i}>
            <Topic value={v} />
          </li>
        ))}
      </ul>
    )
  if (typeof value === 'object') {
    const fields = value as Record<string, unknown>
    const { japanese, reading, translation, pattern, explanation, example } = fields
    const count = Object.keys(fields).length
    if (
      count === 3 &&
      typeof japanese === 'string' &&
      typeof reading === 'string' &&
      typeof translation === 'string'
    ) {
      return (
        <p>
          <strong>{japanese}</strong>（{reading}）— {translation}
        </p>
      )
    }
    if (
      count === 4 &&
      typeof pattern === 'string' &&
      typeof explanation === 'string' &&
      typeof example === 'string' &&
      typeof translation === 'string'
    ) {
      return (
        <div>
          <p>
            <strong>{pattern}</strong> — {explanation}
          </p>
          <p>
            {example} — {translation}
          </p>
        </div>
      )
    }
    return (
      <dl className="topic-fields">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>
              {(
                {
                  title: 'Тема',
                  title_ru: 'Тема',
                  questions: 'Вопросы',
                  vocabulary: 'Лексика',
                  grammar: 'Грамматика',
                  vocabulary_theme: 'Тема лексики',
                  introduction: 'Вступление',
                  japanese: 'Японский',
                  reading: 'Чтение',
                  pattern: 'Конструкция',
                  explanation: 'Объяснение',
                  example: 'Пример',
                  jlpt_level: 'Уровень',
                  translation: 'Перевод',
                  text: 'Текст',
                } as Record<string, string>
              )[k] || k}
            </dt>
            <dd>
              <Topic value={v} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  return null
}
