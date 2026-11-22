import { lazy } from 'react'
import { CalendarDays, Users, UserRound, MessageSquare, Sparkles } from 'lucide-react'

// Navigation metadata belongs to modules; layout does not know their count.
export const modules = [
  {
    id: 'events',
    path: '/admin/events',
    roots: ['/admin/events', '/admin/publications'],
    label: 'Мероприятия',
    icon: CalendarDays,
    component: lazy(() => import('../modules/events/EventsPage')),
  },
  {
    id: 'people',
    path: '/admin/people',
    label: 'Участники',
    icon: Users,
    component: lazy(() => import('../modules/people/PeoplePage')),
  },
  {
    id: 'ai',
    path: '/admin/ai',
    label: 'ИИ',
    icon: Sparkles,
    component: lazy(() => import('../modules/ai/AIPage')),
  },
  {
    id: 'feedback',
    path: '/admin/feedback',
    label: 'Отзывы',
    icon: MessageSquare,
    component: lazy(() => import('../modules/feedback/FeedbackPage')),
  },
]
export const memberModules = [
  { id: 'events', path: '/events', roots: ['/events'], label: 'Мероприятия', icon: CalendarDays, component: lazy(() => import('../modules/member/events/EventsPage')) },
  { id: 'profile', path: '/profile', roots: ['/profile'], label: 'Мой профиль', icon: UserRound, component: lazy(() => import('../modules/member/ProfilePage')) },
  { id: 'feedback', path: '/feedback', roots: ['/feedback'], label: 'Отзывы', icon: MessageSquare, component: lazy(() => import('../modules/member/FeedbackPage')) },
]
export const MemberEventDetail = lazy(() => import('../modules/member/events/EventDetail'))
export const AIJobDetail = lazy(() => import('../modules/ai/AIJobDetail'))
export const EventDetail = lazy(() => import('../modules/events/EventDetail'))
export const PublicationsPage = lazy(() => import('../modules/publications/PublicationsPage'))
export const PublicationDetail = lazy(() => import('../modules/publications/PublicationDetail'))
export const FeedbackDetail = lazy(() => import('../modules/feedback/FeedbackDetail'))
