// V1.0 (v2.5) 端到端测试：配对 → 数据下发 → 照片拉取 → 状态上报 → Web 后台 → 对话工具（含 3 星上限）。
import test from 'node:test'
import assert from 'node:assert/strict'
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
  return { store, pairing, server, port, base, call, tools, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r) }) }
}

async function pair(app) {
  const nonce = 'n'.repeat(24)
  assert.equal((await app.call('/api/pair/request', { method: 'POST', body: { code: '4821', nonce } })).status, 200)
  assert.equal((await app.call('/api/pair/poll', { method: 'POST', body: { nonce } })).json.status, 'waiting')
  const ok = await app.call('/api/pair/approve', { method: 'POST', body: { code: '4821' }, headers: { 'X-CB-Local': '1' } })
  assert.equal(ok.json.ok, true)
  const got = await app.call('/api/pair/poll', { method: 'POST', body: { nonce } })
  assert.equal(got.json.status, 'approved')
  return got.json.token
}

test('工牌没有令牌拿不到资料和照片，且无远程息屏接口', async () => {
  const app = await boot()
  try {
    assert.equal((await app.call('/api/device/profile')).status, 401)
    assert.equal((await app.call('/api/device/photo')).status, 401)
    assert.equal((await app.call('/api/device/sleep', { method: 'POST' })).status, 401)
  } finally { await app.close() }
})

test('配对 → 拿资料 → 后台同步下发新字段 → 拉取照片', async () => {
  const app = await boot()
  try {
    const token = await pair(app)
    const h = { 'X-Device-Token': token }
    const first = await app.call('/api/device/profile?since=0', { headers: h })
    assert.equal(first.json.changed, true)
    assert.equal(first.json.profile.name, '刘杰')

    const put = await app.call('/api/profile', {
      method: 'PUT',
      body: {
        name: '高鸣',
        style: 1,
        palette_idx: 2,
        sub_scene: 1,
        mood_idx: 3,
        qrs: [{ label: '微信好友', url: 'https://u.wechat.com/M1234', channel: 1 }],
        memos: [
          { text: '任务1', done: false, star: true },
          { text: '任务2', done: false, star: true },
          { text: '任务3', done: false, star: true },
          { text: '任务4', done: false, star: true }, // 第 4 颗星应被拦截
        ],
      },
    })
    assert.equal(put.json.profile.name, '高鸣')
    assert.equal(put.json.profile.sub_scene, 1)
    assert.equal(put.json.profile.mood_idx, 3)
    assert.equal(put.json.profile.memos.filter((m) => m.star).length, 3)

    const next = await app.call(`/api/device/profile?since=${first.json.version}`, { headers: h })
    assert.equal(next.json.changed, true)
    assert.equal(next.json.profile.sub_scene, 1)
    assert.equal(next.json.profile.mood_idx, 3)
    assert.equal(next.json.profile.memo_star, 0b0111)
    assert.deepEqual(next.json.profile.qrs, [{ label: '微信好友', url: 'https://u.wechat.com/M1234', channel: 1 }])

    app.store.savePhoto({ png: Buffer.from([137, 80, 78, 71]), rgb565a8: Buffer.alloc(62208, 0x55) })
    const ph = await fetch(`${app.base}/api/device/photo`, { headers: h })
    assert.equal(ph.status, 200)
    assert.equal((await ph.arrayBuffer()).byteLength, 62208)
  } finally { await app.close() }
})

test('Web 后台、7 内置头像静态资源与 /api/meta 均正常返回', async () => {
  const app = await boot()
  try {
    const html = await (await fetch(`${app.base}/`)).text()
    assert.ok(html.includes('同步到工牌'))
    assert.equal(html.includes('远程息屏'), false)
    assert.equal(html.includes('工牌在线'), false)

    const meta = (await app.call('/api/meta')).json
    assert.equal(meta.styles.length, 5)
    assert.equal(meta.builtinAvatars.length, 7)
    assert.equal(meta.pixelSprites.length, 6)

    for (const av of meta.builtinAvatars) {
      const r = await fetch(`${app.base}${av.src}`)
      assert.equal(r.status, 200, av.src)
    }
  } finally { await app.close() }
})

test('对话工具 badge_update / badge_memo（3 星上限）工作正常', async () => {
  const app = await boot()
  try {
    await app.tools.badge_update.execute({ style: '心情贴纸', sub_scene: '手账潮玩', mood_idx: 2 })
    assert.equal(app.store.profile.style, 1)
    assert.equal(app.store.profile.sub_scene, 1)
    assert.equal(app.store.profile.mood_idx, 2)

    for (let i = 1; i <= 4; i++) await app.tools.badge_memo.execute({ action: 'add', text: `事项${i}` })
    await app.tools.badge_memo.execute({ action: 'star', index: 1 })
    await app.tools.badge_memo.execute({ action: 'star', index: 2 })
    await app.tools.badge_memo.execute({ action: 'star', index: 3 })
    const fourth = await app.tools.badge_memo.execute({ action: 'star', index: 4 })
    assert.ok(fourth.includes('最多允许标记 3 条'))
  } finally { await app.close() }
})
