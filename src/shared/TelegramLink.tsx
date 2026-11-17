export function TelegramLink({ username, id }: { username: string | null; id: number }) {
  const clean = username?.replace(/^@/, '')
  const valid = clean && /^[a-zA-Z0-9_]+$/.test(clean)
  const href = valid ? 'https://t.me/' + clean : 'tg://user?id=' + id
  return (
    <a
      className="text-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={
        valid
          ? 'Открыть чат в Telegram'
          : 'Открыть профиль в Telegram; доступ зависит от настроек аккаунта'
      }
    >
      {valid ? '@' + clean : 'Открыть профиль ↗'}
    </a>
  )
}
