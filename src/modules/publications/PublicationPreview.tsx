import { useEffect, useState, type ReactNode } from 'react'
import { apiBlob, type Publication, type MessageEntity } from '../../shared/api'
import { TelegramMentions } from '../../shared/TelegramLink'

export function safeLink(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return
  try {
    const url = new URL(raw)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      return url.href
  } catch {}
}

export function EntityText({
  text,
  entities = [],
}: {
  text: string
  entities?: MessageEntity[] | null
}) {
  const valid = (entities || [])
    .slice(0, 1000)
    .filter(
      (e) =>
        Number.isInteger(e.offset) &&
        Number.isInteger(e.length) &&
        e.offset >= 0 &&
        e.length > 0 &&
        e.offset + e.length <= text.length,
    )
  const cuts = [
    ...new Set([0, text.length, ...valid.flatMap((e) => [e.offset, e.offset + e.length])]),
  ].sort((a, b) => a - b)
  if (valid.length === 0) return <TelegramMentions text={text} />
  return (
    <>
      {cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1]
        let node: ReactNode = text.slice(start, end)
        for (const entity of valid
          .filter((e) => e.offset <= start && e.offset + e.length >= end)
          .sort((a, b) => a.length - b.length)) {
          switch (entity.type) {
            case 'bold':
              node = <strong>{node}</strong>
              break
            case 'italic':
              node = <em>{node}</em>
              break
            case 'underline':
              node = <u>{node}</u>
              break
            case 'strikethrough':
              node = <s>{node}</s>
              break
            case 'code':
            case 'pre':
              node = <code>{node}</code>
              break
            case 'spoiler':
              node = (
                <span className="spoiler" tabIndex={0}>
                  {node}
                </span>
              )
              break
            case 'blockquote':
            case 'expandable_blockquote':
              node = <span className="quote-inline">{node}</span>
              break
            case 'text_link':
            case 'url':
            case 'mention': {
              const raw =
                entity.type === 'text_link'
                  ? entity.url
                  : entity.type === 'mention'
                    ? 'https://t.me/' + text.slice(entity.offset + 1, entity.offset + entity.length)
                    : text.slice(entity.offset, entity.offset + entity.length)
              const href = safeLink(raw)
              if (href)
                node = (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {node}
                  </a>
                )
              break
            }
          }
        }
        return <span key={start}>{node}</span>
      })}
    </>
  )
}

function PreviewImage({ publicationId, position }: { publicationId: number; position: number }) {
  const [url, setUrl] = useState<string>(),
    [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let objectURL: string | undefined
    setUrl(undefined)
    setError(false)
    apiBlob(`/publications/${publicationId}/media/${position}`, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectURL = URL.createObjectURL(blob)
          setUrl(objectURL)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => {
      controller.abort()
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [publicationId, position])
  return error ? (
    <p className="muted">Изображение недоступно. Оригинал сохранён в Telegram.</p>
  ) : url ? (
    <img src={url} alt="Изображение анонса" loading="lazy" />
  ) : (
    <p className="muted">Загружаем изображение…</p>
  )
}

function richText(value: unknown, depth = 0, allowMentions = true): ReactNode {
  if (depth > 20) return null
  if (typeof value === 'string') return allowMentions ? <TelegramMentions text={value} /> : value
  if (Array.isArray(value))
    return value.map((v, i) => <span key={i}>{richText(v, depth + 1, allowMentions)}</span>)
  if (!value || typeof value !== 'object') return null
  const n = value as Record<string, unknown>,
    inner = richText(
      n.text ?? n.items ?? n.alternative_text ?? n.expression,
      depth + 1,
      allowMentions && !['link', 'url', 'code', 'monospace'].includes(String(n.type)),
    )
  switch (n.type) {
    case 'bold':
      return <strong>{inner}</strong>
    case 'italic':
      return <em>{inner}</em>
    case 'underline':
      return <u>{inner}</u>
    case 'strikethrough':
      return <s>{inner}</s>
    case 'code':
    case 'monospace':
      return <code>{inner}</code>
    case 'spoiler':
      return (
        <span className="spoiler" tabIndex={0}>
          {inner}
        </span>
      )
    case 'subscript':
      return <sub>{inner}</sub>
    case 'superscript':
      return <sup>{inner}</sup>
    case 'marked':
      return <mark>{inner}</mark>
    case 'url':
    case 'link': {
      const href = safeLink(n.url)
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      ) : (
        inner
      )
    }
    default:
      return inner
  }
}

export function PublicationPreview({ publication }: { publication: Publication }) {
  let photo = 0
  const blocks = (values: unknown, depth = 0): ReactNode => {
    if (depth > 20 || !Array.isArray(values)) return null
    return values.map((value, index) => {
      if (!value || typeof value !== 'object') return null
      const b = value as Record<string, unknown>,
        text = richText(b.text, 0, b.type !== 'pre'),
        children = () => blocks(b.blocks, depth + 1)
      switch (b.type) {
        case 'heading':
          return (
            <h3
              key={index}
              className={`rich-heading-${Number.isInteger(b.size) && Number(b.size) >= 1 && Number(b.size) <= 6 ? b.size : 1}`}
            >
              {text}
            </h3>
          )
        case 'paragraph':
          return <p key={index}>{text}</p>
        case 'footer':
          return (
            <p className="muted" key={index}>
              {text}
            </p>
          )
        case 'divider':
          return <hr key={index} />
        case 'blockquote':
        case 'quote':
        case 'pullquote':
        case 'expandable_blockquote':
          return (
            <blockquote key={index}>
              {text}
              {children()}
              <footer>{richText(b.credit)}</footer>
            </blockquote>
          )
        case 'pre':
          return <pre key={index}>{text}</pre>
        case 'list':
          return (
            <ul key={index}>
              {Array.isArray(b.items) &&
                b.items.map((item, i) => {
                  const li = item as Record<string, unknown>
                  return (
                    <li key={i}>
                      {richText(li.label)}
                      {blocks(li.blocks, depth + 1)}
                    </li>
                  )
                })}
            </ul>
          )
        case 'collage':
        case 'slideshow':
          return (
            <div key={index} className="preview-media">
              {children()}
              {richText(b.caption)}
            </div>
          )
        case 'details':
          return (
            <details key={index} open={b.is_open === true}>
              <summary>{richText(b.summary)}</summary>
              {children()}
            </details>
          )
        case 'table':
          return (
            <div className="table-scroll" key={index}>
              <table>
                <tbody>
                  {Array.isArray(b.cells) &&
                    b.cells.map((row, i) => (
                      <tr key={i}>
                        {Array.isArray(row) &&
                          row.map((cell, j) => {
                            const c = cell as Record<string, unknown>
                            return <td key={j}>{richText(c.text)}</td>
                          })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )
        case 'anchor':
          return null
        case 'photo': {
          const position = photo++
          const image = publication.media?.[position] ? (
            <PreviewImage publicationId={publication.id} position={position} />
          ) : (
            <p className="muted">Фото доступно в оригинале Telegram.</p>
          )
          return (
            <figure key={index}>
              {b.has_spoiler ? (
                <details>
                  <summary>Показать фото со спойлером</summary>
                  {image}
                </details>
              ) : (
                image
              )}
              <figcaption>{richText(b.caption)}</figcaption>
            </figure>
          )
        }
        case 'buttons':
          return (
            <div className="button-row" key={index}>
              {Array.isArray(b.buttons) &&
                b.buttons.map((v, i) => {
                  const button = v as Record<string, unknown>,
                    href = safeLink(button.url)
                  return href ? (
                    <a
                      key={i}
                      className="button secondary"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {richText(button.text, 0, false)}
                    </a>
                  ) : (
                    <span key={i}>{richText(button.text)}</span>
                  )
                })}
            </div>
          )
        default:
          return (
            <div key={index}>
              {text}
              {children()}
              <p className="muted">Этот элемент доступен в оригинале Telegram.</p>
            </div>
          )
      }
    })
  }
  return (
    <article className="message-preview" aria-label="Предпросмотр анонса">
      {publication.rich_message ? (
        blocks(publication.rich_message.blocks)
      ) : (
        <>
          <div className="preview-media">
            {publication.media?.map((m) => (
              <PreviewImage key={m.position} publicationId={publication.id} position={m.position} />
            ))}
          </div>
          <p>
            <EntityText text={publication.text} entities={publication.entities} />
          </p>
        </>
      )}
      {publication.event && (
        <span className="button secondary registration-preview">Зарегистрироваться</span>
      )}
    </article>
  )
}
