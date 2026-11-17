// 把服务真的跑起来，按工牌固件的顺序走一遍：发现 → 配对 → 拿资料 → 上报状态；再走编辑页和对话工具。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSocket } from 'node:dgram'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pairing } from '../lib/pairing.js'
import { startServer } from '../lib/server.js'
import { Store } from '../lib/store.js'
import { registerTools } from '../lib/tools.js'

const quiet = { info() {}, warn() {}, error() {} }

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'cb-e2e-'))
  const store = new Store({ dir })
  const pairing = new Pairing({ file: join(dir, 'devices.json'), log: quiet })
  const server = await startServer({ store, pairing, port: 0, host: '127.0.0.1', log: quiet })
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) }
  }
  const tools = {}
  registerTools({ tools: { register: (def) => { tools[def.name] = def } } }, { store, port })
  return { store, pairing, server, port, call, tools, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r) }) }
}

async function pair(app) {
  const nonce = 'n'.repeat(24)
  assert.equal((await app.call('/api/pair/request', { method: 'POST', body: { code: '4821', nonce } })).status, 200)
  assert.equal((await app.call('/api/pair/poll', { method: 'POST', body: { nonce } })).json.status, 'waiting')
  const info = await app.call('/api/info')
  assert.deepEqual(info.json.pairing.map((p) => p.code), ['4821'])
  const ok = await app.call('/api/pair/approve', { method: 'POST', body: { code: '4821' }, headers: { 'X-CB-Local': '1' } })
  assert.equal(ok.json.ok, true)
  const got = await app.call('/api/pair/poll', { method: 'POST', body: { nonce } })
  assert.equal(got.json.status, 'approved')
  return got.json.token
}

test('工牌没有令牌拿不到资料', async () => {
  const app = await boot()
  try {
    assert.equal((await app.call('/api/device/profile')).status, 401)
    assert.equal((await app.call('/api/device/profile', { headers: { 'X-Device-Token': 'guess' } })).status, 401)
    assert.equal((await app.call('/api/device/state', { method: 'POST', body: { status: 1 } })).status, 401)
  } finally { await app.close() }
})

test('配对 → 拿资料 → 没变化时只回版本号 → 电脑上改了再拿到新的', async () => {
  const app = await boot()
  try {
    const token = await pair(app)
    const h = { 'X-Device-Token': token }
    const first = await app.call('/api/device/profile?since=0', { headers: h })
    assert.equal(first.json.changed, true)
    assert.equal(first.json.profile.name, '新同学')
    assert.match(first.json.profile.avatar, /^[0-9a-f]{256}$/)
    const same = await app.call(`/api/device/profile?since=${first.json.version}`, { headers: h })
    assert.deepEqual(same.json, { version: first.json.version, changed: false })

    const put = await app.call('/api/profile', { method: 'PUT', body: { name: '高鸣', memos: [{ text: '交周报', done: false }], answers: ['先问问老板'] } })
    assert.equal(put.json.profile.name, '高鸣')
    assert.ok(!('nfc' in put.json) && !('link' in put.json))
    const next = await app.call(`/api/device/profile?since=${first.json.version}`, { headers: h })
    assert.equal(next.json.changed, true)
    assert.equal(next.json.profile.name, '高鸣')
    assert.deepEqual(next.json.profile.memos, ['交周报'])
    assert.deepEqual(next.json.profile.cards, ['先问问老板'])
    assert.equal(next.json.profile.memo_done, 0)
    assert.equal(app.store.deviceInfo().online, true)
  } finally { await app.close() }
})

test('在工牌上切状态：电脑上的资料跟着变', async () => {
  const app = await boot()
  try {
    const h = { 'X-Device-Token': await pair(app) }
    const r = await app.call('/api/device/state', { method: 'POST', headers: h, body: { status: 3, theme: 1, memo_done: 0, touches: 12, lucky: 0, battery: 88, fw: '0.6.1' } })
    assert.equal(r.status, 200)
    const snap = await app.call('/api/profile')
    assert.equal(snap.json.profile.status, 3)
    assert.equal(snap.json.profile.theme, 1)
    assert.equal(snap.json.device.battery, 88)
    assert.equal(snap.json.version, r.json.version)
    const info = await app.call('/api/info')
    assert.equal(info.json.profile.status, '摸鱼中')
    assert.equal(info.json.profile.theme, 'NEON')
  } finally { await app.close() }
})

test('别的网站不能替主人改资料或点“允许”', async () => {
  const app = await boot()
  try {
    const evil = { Origin: 'https://evil.example' }
    assert.equal((await app.call('/api/profile', { method: 'PUT', body: { name: '黑客' }, headers: evil })).status, 403)
    await app.call('/api/pair/request', { method: 'POST', body: { code: '1111', nonce: 'm'.repeat(24) } })
    assert.equal((await app.call('/api/pair/approve', { method: 'POST', body: { code: '1111' }, headers: { ...evil, 'X-CB-Local': '1' } })).status, 403)
    assert.equal((await app.call('/api/pair/approve', { method: 'POST', body: { code: '1111' } })).status, 403)     // 没带自定义请求头
    assert.equal(app.store.profile.name, '新同学')
    assert.equal(app.pairing.list().length, 1)
    assert.equal((await app.call('/api/profile', { method: 'PUT', body: [] })).status, 400)
  } finally { await app.close() }
})

test('编辑页和字体能打开', async () => {
  const app = await boot()
  try {
    const page = await fetch(`http://127.0.0.1:${app.port}/`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /赛博<b>工牌<\/b>/)
    const font = await fetch(`http://127.0.0.1:${app.port}/assets/SmileySans-Oblique.woff2`)
    assert.equal(font.headers.get('content-type'), 'font/woff2')
    const meta = await app.call('/api/meta')
    assert.equal(meta.json.themes.length, 6)
    assert.ok(meta.json.presets.length >= 4)
    assert.equal((await app.call('/nope')).status, 404)
  } finally { await app.close() }
})

test('对话工具：查看、修改、切状态', async () => {
  const app = await boot()
  try {
    const { tools, store } = app
    assert.deepEqual(Object.keys(tools).sort(), ['badge_get', 'badge_memo', 'badge_set_status', 'badge_update'])
    assert.match(await tools.badge_get.execute({}), /姓名：新同学/)
    const out = await tools.badge_update.execute({ name: '高鸣', job_title: '产品经理', skin: 'klein', answers: ['先问问老板', '摸鱼去'] })
    assert.match(out, /已更新/)
    assert.equal(store.profile.title, '产品经理')
    assert.equal(store.profile.theme, 3)
    assert.deepEqual(store.profile.answers, ['先问问老板', '摸鱼去'])
    assert.match(await tools.badge_update.execute({ skin: 'RAINBOW' }), /没有叫 RAINBOW 的皮肤/)
    assert.match(await tools.badge_update.execute({ avatar: ['short'] }), /头像格式不对/)
    const rows = Array.from({ length: 16 }, () => '..11111111111...')
    await tools.badge_update.execute({ avatar: rows })
    assert.equal(store.profile.avatar.slice(0, 4), '0011')

    assert.match(await tools.badge_set_status.execute({ status: '开会' }), /开会中/)      // 模糊匹配已有状态
    assert.equal(store.profile.status, 2)
    assert.match(await tools.badge_set_status.execute({ status: '带薪发呆' }), /带薪发呆/)   // 列表满了：替换最后一个
    assert.equal(store.profile.statuses.length, 6)
    assert.equal(store.profile.statuses[store.profile.status], '带薪发呆')
  } finally { await app.close() }
})

test('对话工具：便签的加、完成、删、清理', async () => {
  const app = await boot()
  try {
    const { tools, store } = app
    const texts = () => store.profile.memos.map((m) => (m.done ? '✓' : '') + m.text)
    for (const t of ['一', '二', '三', '四']) await tools.badge_memo.execute({ action: 'add', text: t })
    assert.deepEqual(texts(), ['一', '二', '三', '四'])
    assert.match(await tools.badge_memo.execute({ action: 'done', index: 2 }), /\[已完成\] 二/)
    await tools.badge_memo.execute({ action: 'add', text: '五' })          // 满了：先挤掉已完成的
    assert.deepEqual(texts(), ['一', '三', '四', '五'])
    await tools.badge_memo.execute({ action: 'add', text: '六' })          // 没有已完成的：挤掉最旧的
    assert.deepEqual(texts(), ['三', '四', '五', '六'])
    assert.match(await tools.badge_memo.execute({ action: 'remove', index: 9 }), /没有第 9 条/)
    await tools.badge_memo.execute({ action: 'remove', index: 1 })
    await tools.badge_memo.execute({ action: 'done', index: 1 })
    assert.deepEqual(texts(), ['✓四', '五', '六'])
    await tools.badge_update.execute({ memos: ['五', '四', '新的'] })      // 整表替换：没动的保留已完成
    assert.deepEqual(texts(), ['五', '✓四', '新的'])
    assert.match(await tools.badge_memo.execute({ action: 'clear_done' }), /1\. 五/)
    assert.deepEqual(texts(), ['五', '新的'])
    assert.match(await tools.badge_memo.execute({ action: 'add', text: '  ' }), /没有收到/)
    assert.match(await tools.badge_get.execute({}), /1\. 五\n2\. 新的/)
  } finally { await app.close() }
})

test('局域网发现：工牌广播 CBG?，回 CBG! 和端口', async () => {
  const pairing = new Pairing({ log: quiet })
  const sock = createSocket('udp4')
  try {
    pairing.startDiscovery(18797, 18798)      // 用测试专用端口，不和正在运行的插件抢 8798
    await new Promise((r) => pairing.udp.once('listening', r))
    const reply = await new Promise((resolve, reject) => {
      sock.once('message', (m) => resolve(m.toString()))
      sock.send('CBG?', 18798, '127.0.0.1', (e) => e && reject(e))
      setTimeout(() => reject(new Error('no reply')), 2000)
    })
    assert.equal(reply, 'CBG! 18797')
  } finally { sock.close(); pairing.stop() }
})
