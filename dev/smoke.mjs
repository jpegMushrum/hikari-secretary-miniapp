import assert from 'node:assert/strict'

// HTTP-only check: never launches a browser, changes data or calls Telegram.
const base = 'http://localhost:5173'
async function read(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200, path)
  return response
}
const html = await (await read('/admin/events')).text()
assert.match(html, /data-theme="dark"/)
assert.match(html, /<div id="root"><\/div>/)
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map((m) => m[1])
assert.ok(assets.length >= 2)
for (const asset of assets) {
  const text = await (await read(asset)).text()
  assert.ok(
    !text.includes('local-miniapp-only-not-a-telegram-token'),
    'signing key must not be bundled',
  )
}
assert.deepEqual(await (await read('/api/dev/context')).json(), { local: true })
assert.equal((await (await read('/api/v1/admin/me')).json()).telegram_id, 123456789)
for (const path of [
  '/people?sort=visits&order=desc',
  '/events?status=active',
  '/event-workspace',
  '/feedback?kind=event',
  '/ai/history',
  '/publications?status=draft',
]) {
  const result = await (await read('/api/v1/admin' + path)).json()
  assert.ok(Array.isArray(result.items), path)
  assert.equal(typeof result.page.total_items, 'number', path)
  console.log('OK', path, 'items=' + result.items.length)
}
for (const path of [
  '/ai/settings',
  '/targets',
])
  await read('/api/v1/admin' + path)
const foreign = await fetch(base + '/api/v1/admin/me', {
  headers: { Origin: 'https://example.invalid' },
})
assert.equal(foreign.status, 403)
const privateAPI = await fetch(base + '/api/internal/bot/v1/people')
assert.equal(privateAPI.status, 404)
for (const resource of ['events', 'feedback']) {
  const page = await (await read('/api/v1/admin/' + resource)).json()
  if (page.items.length) {
    const id = page.items[0].id
    await read('/api/v1/admin/' + resource + '/' + id)
    if (resource === 'events') await read('/api/v1/admin/events/' + id + '/participants?needs_pass=true')
  } else console.log('SKIP ' + resource + ' detail: empty database')
}
const drafts = await (await read('/api/v1/admin/publications?status=draft')).json()
if (!drafts.items.length) console.log('SKIP draft detail: no drafts in this database')
for (const item of drafts.items) {
  const publication = await (await read('/api/v1/admin/publications/' + item.id)).json()
  assert.ok(Array.isArray(publication.media), 'preview media contract')
  assert.ok(!('media_paths' in publication), 'no filesystem paths exposed')
  await read('/admin/publications/' + item.id)
}
console.log('OK HTML, assets, SPA fallback, four modules, local auth and origin restrictions')
