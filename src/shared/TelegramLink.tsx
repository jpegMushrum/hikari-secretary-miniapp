import type { ReactNode } from 'react'

function UsernameLink({ name }: { name: string }) {
  return (
    <a
      className="text-link"
      href={'https://t.me/' + name}
      target="_blank"
      rel="noopener noreferrer"
      title="Открыть чат в Telegram"
    >
      @{name}
    </a>
  )
}

export function TelegramMentions({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let offset = 0
  // A handle starts a word. Addresses and URL paths can also contain '@'.
  for (const match of text.matchAll(/(^|[\s([{«“"'—–])@([A-Za-z0-9_]{1,32})(?![\p{L}\p{N}_])/gu)) {
    const start = match.index + match[1].length
    parts.push(text.slice(offset, start), <UsernameLink key={start} name={match[2]} />)
    offset = start + match[2].length + 1
  }
  return (
    <>
      {parts}
      {text.slice(offset)}
    </>
  )
}

export function TelegramLink({ username, id }: { username: string | null; id: number }) {
  const clean = username?.replace(/^@/, '')
  const valid = clean && /^[a-zA-Z0-9_]+$/.test(clean)
  if (valid) return <UsernameLink name={clean} />
  return (
    <a
      className="text-link"
      href={'tg://user?id=' + id}
      target="_blank"
      rel="noopener noreferrer"
      title="Открыть профиль в Telegram; доступ зависит от настроек аккаунта"
    >
      Открыть профиль ↗
    </a>
  )
}
