import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { createGateway, initData, DEV_TOKEN, DEV_USER } from './gateway.mjs'

test('local initData is signed with the Telegram algorithm and dummy identity', () => {
  const params = new URLSearchParams(initData(1700000000))
  assert.equal(JSON.parse(params.get('user')).id, DEV_USER)
  assert.equal(params.get('auth_date'), '1700000000')
  const hash = params.get('hash')
  params.delete('hash')
  params.sort()
  const secret = createHmac('sha256', 'WebAppData').update(DEV_TOKEN).digest()
  const expected = createHmac('sha256', secret)
    .update([...params].map(([k, v]) => `${k}=${v}`).join('\n'))
    .digest('hex')
  assert.equal(hash, expected)
})

test('gateway confines proxying to local admin requests and replaces client credentials', async (t) => {
  let forwarded
  const upstream = createServer((req, res) => {
    forwarded = { url: req.url, auth: req.headers.authorization }
    res.setHeader('Content-Type', 'application/json')
    res.end('{"ok":true}')
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  t.after(() => upstream.close())
  const gateway = createGateway('http://127.0.0.1:' + upstream.address().port)
  gateway.listen(0, '127.0.0.1')
  await once(gateway, 'listening')
  t.after(() => gateway.close())
  const call = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: gateway.address().port,
          path,
          headers: { host: 'localhost:5173', ...headers },
        },
        (res) => {
          let body = ''
          res.on('data', (d) => (body += d))
          res.on('end', () => resolve({ status: res.statusCode, body }))
        },
      )
      req.on('error', reject)
      req.end()
    })
  assert.equal((await call('/api/dev/context')).status, 200)
  assert.equal((await call('/api/v1/admin/me', { origin: 'https://attacker.invalid' })).status, 403)
  assert.equal((await call('/api/v1/admin/me', { host: 'attacker.invalid' })).status, 403)
  assert.equal((await call('/api/v1/admin/me', { 'sec-fetch-site': 'cross-site' })).status, 403)
  for (const path of [
    '/api/v1/bot/people',
    '/api/v1/admin/../bot',
    '/api/v1/admin/%2e%2e/bot',
    '//attacker.invalid/',
    '/healthz',
  ])
    assert.equal((await call(path)).status, 404)
  assert.equal(forwarded, undefined)
  assert.equal(
    (
      await call('/api/v1/admin/people?page=2', {
        authorization: 'Bearer malicious',
        origin: 'http://localhost:5174',
      })
    ).status,
    200,
  )
  assert.equal(forwarded.url, '/api/v1/admin/people?page=2')
  assert.match(forwarded.auth, /^tma /)
})
