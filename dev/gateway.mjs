import { createServer, request } from 'node:http'
import { createHmac } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Deliberately not a real Telegram token. This gateway must never use production credentials.
export const DEV_TOKEN = 'local-miniapp-only-not-a-telegram-token'
export const DEV_USER = 123456789
const hosts = new Set(['localhost:5173', '127.0.0.1:5173', 'localhost:5174', '127.0.0.1:5174'])
const origins = new Set([...hosts].map((h) => 'http://' + h))

export function initData(now = Math.floor(Date.now() / 1000)) {
  const data = new URLSearchParams({
    auth_date: String(now),
    user: JSON.stringify({ id: DEV_USER, first_name: 'Администратор', username: 'hikari_local' }),
  })
  const check = [...data]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(DEV_TOKEN).digest()
  data.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
  return data.toString()
}

export function createGateway(upstream = 'http://backend:8080') {
  const target = new URL(upstream)
  if (target.protocol !== 'http:') throw new Error('Local upstream must be HTTP')
  return createServer((req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    // Host + Origin validation prevents DNS rebinding and cross-site writes to the local admin.
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return json(403, { error: 'local_origin_required' })
    if (req.method === 'GET' && req.url === '/api/dev/context') return json(200, { local: true })
    // No proxying bot endpoints, arbitrary destinations, encoded paths, or traversal.
    const pathname = (req.url || '').split('?')[0]
    if (
      !(/^\/api\/v1\/admin\/[a-z0-9/-]+$/.test(pathname) && ['GET', 'POST', 'PUT'].includes(req.method)) &&
      !(/^\/api\/v1\/member\/[a-z0-9/-]+$/.test(pathname) && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method))
    )
      return json(404, { error: 'not_found' })
    const headers = { authorization: 'tma ' + initData(), accept: 'application/json' }
    for (const key of ['content-type', 'content-length', 'idempotency-key'])
      if (req.headers[key]) headers[key] = req.headers[key]
    const proxy = request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: req.url,
        method: req.method,
        headers,
        timeout: 15000,
      },
      (response) => {
        res.writeHead(response.statusCode, {
          'Content-Type': response.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        response.pipe(res)
      },
    )
    proxy.on('timeout', () => proxy.destroy(new Error('upstream timeout')))
    proxy.on('error', () => {
      if (!res.headersSent) json(502, { error: 'backend_unavailable' })
      else res.destroy()
    })
    req.on('aborted', () => proxy.destroy())
    req.pipe(proxy)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.APP_ENV !== 'development')
    throw new Error('Dev gateway requires APP_ENV=development')
  createGateway(process.env.BACKEND_URL).listen(3001, '0.0.0.0', () =>
    console.log('Local miniapp gateway listening on :3001'),
  )
}
