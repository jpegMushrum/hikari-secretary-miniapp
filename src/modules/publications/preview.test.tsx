import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntityText, PublicationPreview, safeLink } from './PublicationPreview'
import { TelegramLink } from '../../shared/TelegramLink'
import type { Publication } from '../../shared/api'

it('renders one green registration action for an event with an existing signup button', () => {
  const publication = {
    event: {},
    rich_message: { blocks: [{ type: 'buttons', buttons: [
      { text: 'Зарегистрироваться', style: 'success', url: 'https://t.me/club_bot?start=event_2' },
      { text: 'Анонс', url: 'https://example.org/event' },
    ] }] },
  } as unknown as Publication
  const html = renderToStaticMarkup(<PublicationPreview publication={publication} />)
  expect(html.match(/Зарегистрироваться/g)).toHaveLength(1)
  expect(html).toContain('button preview-success')
  expect(html).toContain('https://example.org/event')
  expect(html).not.toContain('start=event_2')
})

it('uses UTF-16 entity offsets and escapes HTML, rejecting script links', () => {
  const html = renderToStaticMarkup(
    <EntityText
      text={'光😀 bold <img>'}
      entities={[
        { type: 'bold', offset: 4, length: 4 },
        { type: 'text_link', offset: 9, length: 5, url: 'javascript:alert(1)' },
      ]}
    />,
  )
  expect(html).toContain('<strong>bold</strong>')
  expect(html).toContain('&lt;img&gt;')
  expect(html).not.toContain('href=')
  for (const link of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:pass@example.org',
  ])
    expect(safeLink(link)).toBeUndefined()
})
it('renders nested rich headings, links and list items without modifying stored content', () => {
  const p = {
    id: 1,
    text: 'fallback',
    media: [],
    event: null,
    rich_message: {
      blocks: [
        { type: 'heading', text: { type: 'bold', text: 'Встреча' } },
        {
          type: 'list',
          items: [
            {
              blocks: [
                {
                  type: 'paragraph',
                  text: { type: 'url', text: 'Сайт', url: 'https://example.org' },
                },
              ],
            },
          ],
        },
        { type: 'video' },
      ],
    },
  } as unknown as Publication
  const before = JSON.stringify(p),
    html = renderToStaticMarkup(<PublicationPreview publication={p} />)
  expect(html).toContain('<h3 class="rich-heading-1"><strong>Встреча</strong></h3>')
  expect(html).toContain('<li>')
  expect(html).toContain('href="https://example.org/"')
  expect(html).toContain('оригинале Telegram')
  expect(JSON.stringify(p)).toBe(before)
})
it('links Telegram usernames and uses a user-id fallback without fabricating usernames', () => {
  expect(renderToStaticMarkup(<TelegramLink username="@club_member" id={123} />)).toContain(
    'href="https://t.me/club_member"',
  )
  expect(renderToStaticMarkup(<TelegramLink username={null} id={123} />)).toContain(
    'href="tg://user?id=123"',
  )
})

it('preserves multiline small rich headings', () => {
  const publication = {
    id: 1,
    rich_message: { blocks: [{ type: 'heading', size: 4, text: 'Дата\nАдрес\nВремя' }] },
  } as unknown as Publication
  const html = renderToStaticMarkup(<PublicationPreview publication={publication} />)
  expect(html).toContain('<h3 class="rich-heading-4">Дата\nАдрес\nВремя</h3>')
})

it('links handles in rich text without nesting a link inside an authored link', () => {
  const publication = {
    rich_message: {
      blocks: [
        { type: 'paragraph', text: 'Вопросы к @club_member' },
        { type: 'paragraph', text: { type: 'url', url: 'https://example.org', text: '@contact' } },
      ],
    },
  } as unknown as Publication
  const html = renderToStaticMarkup(<PublicationPreview publication={publication} />)
  expect(html).toContain('href="https://t.me/club_member"')
  expect(html).toContain('href="https://example.org/"')
  expect(html).not.toContain('https://t.me/contact')
})
