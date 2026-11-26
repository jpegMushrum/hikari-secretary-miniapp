import { useEffect, useState } from 'react'
import { apiBlob, memberApiBlob } from './api'

export function ProtectedImage({ path, member, alt, fallback = 'Изображение недоступно.' }: {
  path: string; member: boolean; alt: string; fallback?: string
}) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let objectURL: string | undefined
    setUrl(undefined)
    setError(false)
    const load = member ? memberApiBlob : apiBlob
    load(path, controller.signal)
      .then(blob => {
        if (!controller.signal.aborted) {
          objectURL = URL.createObjectURL(blob)
          setUrl(objectURL)
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => {
      controller.abort()
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [path, member])
  if (error) return <p className="muted">{fallback}</p>
  if (!url) return <p className="muted">Загружаем изображение…</p>
  return <img src={url} alt={alt} loading="lazy" />
}
