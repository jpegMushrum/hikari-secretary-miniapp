// Local browser development does not load or contact Telegram.
export async function initializeTelegram() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  if (!hash.has('tgWebAppData') && !query.has('tgWebAppData')) return
  if (!window.Telegram?.WebApp)
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      const fail = () =>
        reject(new Error('Не удалось подключиться к Telegram. Откройте приложение заново.'))
      const timeout = window.setTimeout(fail, 15000)
      script.src = 'https://telegram.org/js/telegram-web-app.js'
      script.onload = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      script.onerror = () => {
        window.clearTimeout(timeout)
        fail()
      }
      document.head.append(script)
    })
  if (!window.Telegram?.WebApp?.initData)
    throw new Error('Telegram не передал данные входа. Откройте панель кнопкой бота.')
}
