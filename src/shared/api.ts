export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      status === 401
        ? 'Сессия истекла. Откройте приложение заново из Telegram.'
        : status === 403
          ? 'У вас нет доступа к этому разделу.'
          : code === 'capacity_limit'
            ? 'Достигнут лимит: до пяти активных мероприятий или публикаций в очереди. В очереди может быть только один ИИ-пост.'
            : status === 409
              ? 'Состояние изменилось. Обновите страницу и повторите действие.'
              : status === 400
                ? 'Проверьте заполненные поля.'
                : 'Не удалось получить ответ сервера. Попробуйте ещё раз.',
    )
  }
}

type TelegramApp = {
  initData: string
  ready?: () => void
  expand?: () => void
  BackButton?: {
    show: () => void
    hide: () => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
  }
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramApp }
  }
}

async function request(scope: 'admin' | 'member', path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  const initData = window.Telegram?.WebApp?.initData
  if (initData) headers.set('Authorization', 'tma ' + initData)
  else if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const profile = sessionStorage.getItem('hikari.localProfile')
    if (profile) headers.set('X-Local-Profile', profile)
  }
  if (options.body && typeof options.body === 'string')
    headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch('/api/v1/' + scope + path, { ...options, headers })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Нет соединения с сервером. Проверьте подключение.')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(response.status, payload.error ?? 'unknown')
  }
  return response
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request('admin', path, options)
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}
export async function apiBlob(path: string, signal?: AbortSignal) {
  return (await request('admin', path, { signal })).blob()
}

export async function memberApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request('member', path, options)
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}
export async function memberApiBlob(path: string, signal?: AbortSignal) {
  return (await request('member', path, { signal })).blob()
}
export type MemberIdentity = Administrator & { is_admin: boolean }
export type MemberProfile = {
  full_name: string | null
  is_russian_citizen: boolean | null
  is_itmo_student: boolean | null
  feedback_enabled: boolean
}

export type Page<T> = {
  items: T[]
  page: { number: number; size: number; total_items: number; total_pages: number }
}
export type Administrator = {
  telegram_id: number
  first_name: string
  last_name: string
  username: string
}
export type Person = {
  id: number
  full_name: string | null
  display_name: string
  username: string | null
  telegram_user_id: number
  visits: number
  feedback_count: number
  last_visit_at: string | null
  is_russian_citizen: boolean | null
  is_itmo_student: boolean | null
}
export type ClubEvent = {
  id: number
  publication_id: number | null
  title: string
  starts_at: string
  ends_at: string
  status: 'active' | 'completed' | 'cancelled'
  published: boolean
  registrations: number
  cancelled_registrations: number
  attended: number
  created_at: string
}
export type Participant = {
  person_id: number
  telegram_user_id: number
  full_name: string
  username: string | null
  registered_at: string
  cancelled_at: string | null
  status: string
  attended: boolean | null
  is_russian_citizen: boolean | null
  is_itmo_student: boolean | null
  needs_pass: boolean
}
export type Feedback = {
  author_name: string
  event_title: string | null
  id: number
  person_id: number
  event_id: number | null
  text: string
  created_at: string
}
export type FeedbackDetail = Omit<Feedback, 'author_name'> & {
  full_name: string | null
  username: string | null
  telegram_user_id: number
  event_title: string | null
}
export type Publication = {
  entities: MessageEntity[] | null
  rich_message: Record<string, unknown> | null
  media: { position: number; url: string }[]
  event: { title: string; starts_at: string; ends_at: string; status: string } | null
  id: number
  text: string
  status: string
  scheduled_at: string | null
  media_ids: string[]
  deliveries: {
    target_key: string
    target_name: string
    status: string
    last_error: string | null
  }[]
}
export type MessageEntity = {
  type: string
  offset: number
  length: number
  url?: string
  user?: { id: number }
}
export type AISettings = { jlpt_level: string; admin_comment: string | null; enabled: boolean }
export type AIAutomation = {
  enabled: boolean
  configured: boolean
  can_cancel_queued: boolean
  queued_publication_id: number | null
}
export type AITopicVersion = { version: number; topic: Record<string, unknown> }
export type AIJob = {
  id: number
  version_count: number
  can_regenerate: boolean
  scheduled_for: string
  status: string
  attempts: number
  last_error: string | null
  publication_id: number | null
  publication_status: string | null
  topic: Record<string, unknown> | null
}
