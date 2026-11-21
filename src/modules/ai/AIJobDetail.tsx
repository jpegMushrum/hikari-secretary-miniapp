import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicationPreview } from '../publications/PublicationPreview'
import { api, type AIJob, type AITopicVersion, type Page, type Publication } from '../../shared/api'
import { BackLink, ErrorState, Loading, PageHeader, SelectFilter } from '../../shared/components'
import { dateTime } from '../../shared/format'
import { PublicationStatus, topicTitle } from './AIJobStatus'

export default function AIJobDetail() {
  const { id } = useParams()
  const location = useLocation()
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
    if (!job) return
    void client.invalidateQueries({ queryKey: ['/ai/history'] })
    if (job.status === 'scheduled' && job.publication_id != null) {
      void client.invalidateQueries({ queryKey: ['publication', String(job.publication_id)] })
      void client.invalidateQueries({ queryKey: ['/publications'] })
      void client.invalidateQueries({ queryKey: ['/event-workspace'] })
    }
  }, [client, job])
  return (
    <>
      <BackLink to={location.state?.from || '/admin/ai'}>На главную</BackLink>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        job && (
          <>
            <PageHeader title="Предпросмотр публикации" />
            <dl className="topic-meta">
              <dt>Публикация</dt>
              <dd><PublicationStatus job={job} /></dd>
              <dt>По плану</dt>
              <dd><time dateTime={job.scheduled_for}>{dateTime(job.scheduled_for)}</time></dd>
            </dl>
            {job.last_error && <p className="notice error">{job.last_error}</p>}
            <VersionedMaterial key={job.id} job={job} />
          </>
        )
      )}
    </>
  )
}

function VersionedMaterial({ job }: { job: AIJob }) {
  const [selected, setSelected] = useState<AITopicVersion | null>(null)
  const topic = selected?.topic ?? job.topic
  const title = topicTitle({ id: job.id, topic })
  return (
    <div className="topic-detail">
      {job.version_count > 1 && (
        <VersionPicker job={job} selected={selected} onSelect={setSelected} />
      )}
      {!selected && job.publication_id != null ? (
        <JobPublication id={job.publication_id} />
      ) : topic ? (
        <>
          <h2>{selected ? title : 'Сохранённый материал'}</h2>
          {!selected && <p>{title}</p>}
          {typeof topic.introduction === 'string' && <p>{topic.introduction}</p>}
          <Material topic={topic} title={title} />
        </>
      ) : (
        <p className="muted">Материал ещё не сформирован.</p>
      )}
    </div>
  )
}

function VersionPicker({
  job,
  selected,
  onSelect,
}: {
  job: AIJob
  selected: AITopicVersion | null
  onSelect: (version: AITopicVersion | null) => void
}) {
  const versions = useInfiniteQuery({
    queryKey: ['ai-versions', job.id, job.version_count],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api<Page<AITopicVersion>>(`/ai/history/${job.id}/versions?page=${pageParam}&page_size=10`, {
        signal,
      }),
    getNextPageParam: ({ page }) => page.number < page.total_pages ? page.number + 1 : undefined,
  })
  const loaded = new Map<number, AITopicVersion>()
  for (const page of versions.data?.pages ?? []) {
    for (const item of page.items) {
      if (item.version < job.version_count) loaded.set(item.version, item)
    }
  }
  // Keep the selected archive visible if a new generation resets pagination.
  if (selected) loaded.set(selected.version, selected)
  const options: [string, string][] = [['', `№${job.version_count} · Текущая`]]
  for (const item of loaded.values()) {
    const title = topicTitle({ id: job.id, topic: item.topic })
    options.push([String(item.version), `№${item.version} · ${title}`])
  }
  return (
    <div className="topic-versions">
      <SelectFilter
        label="Версия материала"
        value={String(selected?.version ?? '')}
        options={options}
        onChange={(value) => onSelect(loaded.get(Number(value)) ?? null)}
      />
      {versions.isPending && <Loading />}
      {versions.error ? (
        <ErrorState
          error={versions.error}
          retry={() => {
            if (versions.isFetchNextPageError) void versions.fetchNextPage()
            else void versions.refetch()
          }}
        />
      ) : (
        versions.hasNextPage && (
          <button
            type="button"
            className="text-button"
            disabled={versions.isFetchingNextPage}
            onClick={() => void versions.fetchNextPage()}
          >
            {versions.isFetchingNextPage ? 'Загружаем…' : 'Загрузить более ранние версии'}
          </button>
        )
      )}
    </div>
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

function Material({ topic, title }: { topic: Record<string, unknown>; title: string }) {
  if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return <Topic value={topic} />

  const sections = [
    ['questions', 'Вопросы'],
    ['vocabulary', 'Лексика'],
    ['grammar', 'Грамматика'],
  ] as const
  const shown = new Set<string>(sections.map(([key]) => key))
  for (const key of ['title_ru', 'title', 'theme', 'topic']) {
    if (topic[key] === title) shown.add(key)
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
