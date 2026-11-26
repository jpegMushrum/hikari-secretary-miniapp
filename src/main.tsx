import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './app/Layout'
import { ErrorBoundary } from './app/ErrorBoundary'
import {
  modules,
  memberModules,
  MemberEventDetail,
  EventDetail,
  PublicationsPage,
  PublicationDetail,
  FeedbackDetail,
  AIJobDetail,
} from './app/modules'
import { ApiError } from './shared/api'
import './styles.css'
import { initializeTelegram } from './app/telegram'

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
})
const root = ReactDOM.createRoot(document.getElementById('root')!)
const MascotScreen = React.lazy(() => import('./modules/mascot/MascotScreen'))
function start() {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={client}>
          <BrowserRouter>
            <Routes>
              <Route path="/admin/mascot/screen" element={<React.Suspense><MascotScreen /></React.Suspense>} />
              <Route element={<Layout />}>
                <Route path="/admin" element={<Navigate to="/admin/events" replace />} />
                <Route index element={null} />
                {[...modules, ...memberModules].map((m) => (
                  <Route key={m.path} path={m.path} element={<m.component />} />
                ))}
                <Route path="/events/:id" element={<MemberEventDetail />} />
                <Route
                  path="/admin/events/new"
                  element={<Navigate to="/admin/events/drafts?status=draft" replace />}
                />
                <Route path="/admin/events/drafts" element={<PublicationsPage />} />
                <Route path="/admin/publications/:id" element={<PublicationDetail />} />
                <Route path="/admin/events/:id" element={<EventDetail />} />
                <Route path="/admin/ai/history/:id" element={<AIJobDetail />} />
                <Route path="/admin/feedback/:id" element={<FeedbackDetail />} />
                <Route
                  path="*"
                  element={
                    <div className="empty-state">
                      <h1>Страница не найдена</h1>
                      <Link className="text-link" to="/">
                        К мероприятиям
                      </Link>
                    </div>
                  }
                />
              </Route>
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  )
}
void initializeTelegram().then(start, (error) =>
  root.render(
    <main className="page-content">
      <h1>Не удалось войти</h1>
      <p>{String(error.message)}</p>
      <button className="button primary" onClick={() => window.location.reload()}>
        Повторить
      </button>
    </main>,
  ),
)
