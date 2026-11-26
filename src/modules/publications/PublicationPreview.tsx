import { type ReactNode } from 'react'
import { type Publication, type MessageEntity } from '../../shared/api'
import { ProtectedImage } from '../../shared/ProtectedImage'
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

function buttonLabel(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || depth >= 20) return ''
  if (Array.isArray(value)) return value.map(part => buttonLabel(part, depth + 1)).join('')
  const node = value as Record<string, unknown>
  return buttonLabel(node.text ?? node.items, depth + 1)
}

export type Announcement = Pick<Publication, 'id' | 'text' | 'entities' | 'rich_message'> & {
  media: { position: number }[]
  event?: Publication['event']
}

export function PublicationPreview({
  publication, memberEventId,
}: { publication: Announcement; memberEventId?: number }) {
  let photo = 0
  const mediaBase = memberEventId == null
    ? '/publications/' + publication.id
    : '/events/' + memberEventId
  const renderImage = (position: number) => (
    <ProtectedImage key={position} alt="Изображение анонса" fallback="Изображение недоступно. Оригинал сохранён в Telegram." path={mediaBase + '/media/' + position} member={memberEventId != null} />
  )
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
            renderImage(publication.media[position].position)
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
        case 'buttons': {
          const buttons = Array.isArray(b.buttons)
            ? b.buttons.filter(button => button && (
                (!publication.event && memberEventId == null) || buttonLabel(button.text).trim().toLowerCase() !== 'зарегистрироваться'
              ))
            : []
          if (!buttons.length) return null
          return (
            <div className="preview-button-row" key={index}>
              {buttons.map((v, i) => {
                const button = v as Record<string, unknown>
                const href = safeLink(button.url)
                const className = button.style === 'success' ? 'button preview-success' : 'button secondary'
                return href ? (
                  <a key={i} className={className} href={href} target="_blank" rel="noopener noreferrer">
                    {richText(button.text, 0, false)}
                  </a>
                ) : (
                  <span key={i} className={className}>{richText(button.text)}</span>
                )
              })}
            </div>
          )
        }
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
    <article className="message-preview" aria-label={memberEventId == null ? 'Предпросмотр анонса' : 'Анонс мероприятия'}>
      {publication.rich_message ? (
        blocks(publication.rich_message.blocks)
      ) : (
        <>
          <div className="preview-media">
            {publication.media?.map((m) => renderImage(m.position))}
          </div>
          <p>
            <EntityText text={publication.text} entities={publication.entities} />
          </p>
        </>
      )}
      {memberEventId == null && publication.event && (
        <div className="preview-button-row">
          <span className="button preview-success">Зарегистрироваться</span>
        </div>
      )}
    </article>
  )
}
