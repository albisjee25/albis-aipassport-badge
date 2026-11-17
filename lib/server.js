// 本机 HTTP 服务。
//   /、/api/*                 只接受这台电脑自己的访问（工牌编辑页、Harness 里的插件页）
//   /api/device/*             工牌用，必须带 X-Device-Token
//   /api/pair/request|poll    新工牌配对用，不带令牌（在插件页点“允许”后才发令牌）
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESETS } from './avatars.js'
import { LIMITS, devicePayload } from './profile.js'
import { STATUS_COLORS, THEMES } from './themes.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

class HttpError extends Error {
  constructor(status, detail) { super(detail); this.status = status }
}

const send = (res, status, body, headers = {}) => {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, ...headers })
  res.end(data)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 256 * 1024) throw new HttpError(413, 'too long')
    chunks.push(c)
  }
  if (!size) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new HttpError(400, '请求内容不是 JSON') }
}

export function lanAddresses() {
  const out = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  return out
}

/** 编辑页要的全部内容：资料 + 设备数据。 */
export function snapshot(store) {
  const p = store.profile
  return { version: store.version, profile: p, device: store.deviceInfo() }
}

export function startServer({ store, pairing, port, host, log = console }) {
  const localOnly = (req) => {
    if (!LOCAL.has(req.socket.remoteAddress ?? '')) throw new HttpError(403, '这个页面只能在装了插件的电脑上打开')
  }
  const deviceOnly = (req) => {
    if (!pairing.isValidToken(req.headers['x-device-token'])) throw new HttpError(401, 'bad device token')
  }
  // Harness 里的插件页和本服务不同源。只读接口放开；会改东西的跨域请求只放行本机来源，
  // 并要求自定义请求头（浏览器会先预检），防止别的网站替主人点“允许”。
  const READ_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' }
  const originOk = (o) => {
    if (!o || o === 'null') return true
    try { const u = new URL(o); return !/^https?:$/.test(u.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) } catch { return false }
  }
  const writeCors = (req) => {
    const o = req.headers.origin
    if (o && !originOk(o)) { log.warn?.(`[badge] 拒绝了来自 ${o} 的请求`); throw new HttpError(403, 'origin not allowed') }
    return o ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-CB-Local', Vary: 'Origin' } : {}
  }
  const file = (res, path, type) => {
    const data = readFileSync(path)
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': type.startsWith('font/') ? 'max-age=86400' : 'no-store' })
    res.end(data)
  }

  async function route(req, res, url) {
    const m = req.method
    const p = url.pathname

    // ---- 工牌 ----
    if (p.startsWith('/api/device/')) {
      deviceOnly(req)
      if (m === 'GET' && p === '/api/device/profile') {
        store.seen()
        const since = url.searchParams.get('since')
        if (since !== null && Number(since) === store.version) return send(res, 200, { version: store.version, changed: false })
        return send(res, 200, { version: store.version, changed: true, profile: devicePayload(store.profile) })
      }
      if (m === 'POST' && p === '/api/device/state') return send(res, 200, { version: store.deviceState(await readJson(req)) })
      throw new HttpError(404, 'not found')
    }

    // ---- 新工牌配对（工牌还没有令牌）----
    if (m === 'POST' && p === '/api/pair/request') {
      const b = await readJson(req)
      const r = pairing.request({ code: b.code, nonce: b.nonce, ip: req.socket.remoteAddress })
      return send(res, r.error ? 400 : 200, r.error ? { detail: r.error } : r)
    }
    if (m === 'POST' && p === '/api/pair/poll') return send(res, 200, pairing.poll((await readJson(req)).nonce))

    // ---- 以下都只给这台电脑自己用 ----
    localOnly(req)
    if (p === '/api/info') {
      if (m === 'OPTIONS') { res.writeHead(204, READ_CORS); return res.end() }
      if (m === 'GET') {
        const pr = store.profile
        return send(res, 200, {
          ok: true, port, version: store.version, device: store.deviceInfo(), pairing: pairing.list(),
          profile: { name: pr.name, handle: pr.handle, title: pr.title, status: pr.statuses[pr.status], theme: THEMES[pr.theme].name, avatar: pr.avatar, palette: pr.palette },
          memos: { total: pr.memos.length, left: pr.memos.filter((x) => !x.done).length },
          lan: lanAddresses(),
        }, READ_CORS)
      }
    }
    if (p === '/api/pair/approve' || p === '/api/pair/deny') {
      const cors = writeCors(req)
      if (m === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
      if (m === 'POST') {
        if (req.headers['x-cb-local'] !== '1') throw new HttpError(403, 'missing X-CB-Local')
        const code = (await readJson(req)).code
        return send(res, 200, { ok: p.endsWith('approve') ? pairing.approve(code) : pairing.deny(code) }, cors)
      }
    }
    if (m === 'GET' && p === '/') return file(res, join(HERE, '..', 'admin.html'), 'text/html; charset=utf-8')
    if (m === 'GET' && p === '/assets/SmileySans-Oblique.woff2') return file(res, join(HERE, '..', 'assets', 'SmileySans-Oblique.woff2'), 'font/woff2')
    if (m === 'GET' && p === '/api/meta') return send(res, 200, { themes: THEMES, statusColors: STATUS_COLORS, presets: PRESETS, limits: LIMITS })
    if (m === 'GET' && p === '/api/profile') return send(res, 200, snapshot(store))
    if (m === 'PUT' && p === '/api/profile') {
      // 只接受同源页面（编辑页）的修改：带 Origin 的跨站请求一律拒绝
      const o = req.headers.origin
      if (o && !originOk(o)) throw new HttpError(403, 'origin not allowed')
      const body = await readJson(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '资料格式不对')
      store.update(body)
      return send(res, 200, snapshot(store))
    }
    throw new HttpError(404, 'not found')
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://local')
    route(req, res, url).catch((e) => {
      if (res.headersSent) return res.destroy()
      if (e instanceof HttpError) return send(res, e.status, { detail: e.message })
      log.error?.(`[badge] ${req.method} ${url.pathname} 出错：${e.stack || e.message}`)
      send(res, 500, { detail: `服务出错：${e.message}` })
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', (e) => reject(e.code === 'EADDRINUSE' ? new Error(`端口 ${port} 被占用了，在插件设置里换一个端口`) : e))
    server.on('close', () => pairing.stop())
    server.listen(port, host, () => resolve(server))
  })
}
