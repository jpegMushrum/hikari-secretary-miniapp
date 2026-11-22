import type { Announcement } from '../../publications/PublicationPreview'

export const personalStatuses = {
  registered: 'Зарегистрирован',
  not_registered: 'Не зарегистрирован',
  attended: 'Посетил',
  missed: 'Пропустил',
  unmarked: 'Посещение не отмечено',
}

export type MemberEvent = {
  id: number
  title: string
  starts_at: string
  ends_at: string
  status: 'active' | 'completed' | 'cancelled'
  personal_status: keyof typeof personalStatuses
}

export type EventCard = MemberEvent & {
  announcement_url: string | null
  announcement: Announcement | null
  can_register: boolean
  can_manage_registration: boolean
  can_mark_attendance: boolean
  can_leave_feedback: boolean
  reminder_options: number[]
  reminder_offset_minutes: number | null
  preferred_reminder_offset_minutes: number | null
  profile_complete: boolean
}

export type RegistrationProfile = {
  full_name: string
  is_russian_citizen: boolean
  is_itmo_student: boolean
}

export function reminderLabel(minutes: number | null) {
  if (minutes === null) return 'Без уведомления'
  const unit = minutes % 1440 === 0 ? 'day' : minutes % 60 === 0 ? 'hour' : 'minute'
  const count = unit === 'day' ? minutes / 1440 : unit === 'hour' ? minutes / 60 : minutes
  return new Intl.NumberFormat('ru', { style: 'unit', unit, unitDisplay: 'long' }).format(count)
}
