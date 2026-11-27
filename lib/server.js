// 本机 HTTP 服务（V1.0 v2.5）：
//   /、/api/*                 本机 Web 后台（纯展示预览 + 数据下发、本地 Vision 抠图、名片码解码）
//   /api/device/*             工牌拉取配置与照片资产（必须带 X-Device-Token；无远程遥控）
//   /api/pair/request|poll    新工牌配对
import { createSocket } from 'node:dgram'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESETS } from './avatars.js'
import { LIMITS, devicePayload, sanitizeUrl } from './profile.js'
import {
  BUILTIN_AVATARS, MBTI_OPTIONS, MOODS, PIXEL_SPRITES, QR_CHANNELS,
  STATUS_COLORS, STYLES, SUB_SCENES, THEMES,
} from './themes.js'
import { cutoutPortrait, decodeQrFromImage } from './vision.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const AVATAR_FILES = new Set(BUILTIN_AVATARS.map((a) => `${a.key}.png`))

class HttpError extends Error {
  constructor(status, detail) { super(detail); this.status = status }
}

const send = (res, status, body, headers = {}) => {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, ...headers })
  res.end(data)
}

async function readBody(req, maxBytes = 256 * 1024) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > maxBytes) throw new HttpError(413, '文件过大')
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

async function readJson(req, maxBytes = 256 * 1024) {
  const buf = await readBody(req, maxBytes)
  if (!buf.length) return {}
  try { return JSON.parse(buf.toString('utf8')) } catch { throw new HttpError(400, '请求内容不是 JSON') }
}

function parseDataUrlOrBase64(str) {
  const s = String(str ?? '').trim()
  const idx = s.indexOf('base64,')
  const raw = idx >= 0 ? s.slice(idx + 7) : s
  const buf = Buffer.from(raw, 'base64')
  if (!buf.length) throw new HttpError(400, '未收到有效图片')
  return buf
}

export function lanAddresses() {
  const out = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  return out
}

export function snapshot(store, pairing) {
  return {
    version: store.version,
    profile: store.profile,
    hasPhoto: store.hasPhoto(),
    pairing: pairing ? pairing.list() : [],
  }
}

export function startServer({ store, pairing, port, host, log = console }) {
  const localOnly = (req) => {
    if (!LOCAL.has(req.socket.remoteAddress ?? '')) throw new HttpError(403, '这个页面只能在装了插件的电脑上打开')
  }
  const deviceOnly = (req) => {
    if (!pairing.isValidToken(req.headers['x-device-token'])) throw new HttpError(401, 'bad device token')
  }
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
  const sendBuf = (res, data, type, cache = 'no-store') => {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': cache })
    res.end(data)
  }
  const file = (res, path, type) => {
    if (!existsSync(path)) throw new HttpError(404, 'not found')
    sendBuf(res, readFileSync(path), type, type.startsWith('font/') || type.startsWith('image/') ? 'max-age=86400' : 'no-store')
  }

  let lastDeviceIp = ''
  const nudgeDevice = () => {
    try {
      const sock = createSocket('udp4')
      sock.on('error', () => { try { sock.close() } catch {} })
      sock.bind(0, () => {
        try { sock.setBroadcast(true) } catch {}
        const msg = Buffer.from('CBG_SYNC')
        const targets = new Set(['255.255.255.255'])
        if (lastDeviceIp) targets.add(lastDeviceIp)
        let pending = targets.size
        for (const ip of targets) {
          sock.send(msg, 8799, ip, () => {
            if (--pending <= 0) { try { sock.close() } catch {} }
          })
        }
      })
    } catch {}
  }

  async function route(req, res, url) {
    const m = req.method
    const p = url.pathname

    // ---- 工牌端数据拉取与上报 ----
    if (p.startsWith('/api/device/')) {
      deviceOnly(req)
      const ra = String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
      if (ra && ra !== '127.0.0.1' && ra !== '::1') lastDeviceIp = ra
      if (m === 'GET' && p === '/api/device/profile') {
        store.seen()
        const since = url.searchParams.get('since')
        if (since !== null && Number(since) === store.version) return send(res, 200, { version: store.version, changed: false })
        return send(res, 200, { version: store.version, changed: true, profile: devicePayload(store.profile) })
      }
      if (m === 'GET' && p === '/api/device/photo') {
        store.seen()
        const raw = store.getPhotoRaw()
        if (!raw) throw new HttpError(404, 'no photo')
        return sendBuf(res, raw, 'application/octet-stream')
      }
      if (m === 'POST' && p === '/api/device/state') {
        const version = store.deviceState(await readJson(req))
        return send(res, 200, store.lastPowerAck ? { version, pwr_ack: store.lastPowerAck } : { version })
      }
      throw new HttpError(404, 'not found')
    }

    // ---- 配对 ----
    if (m === 'POST' && p === '/api/pair/request') {
      const b = await readJson(req)
      const r = pairing.request({ code: b.code, nonce: b.nonce, ip: req.socket.remoteAddress })
      return send(res, r.error ? 400 : 200, r.error ? { detail: r.error } : r)
    }
    if (m === 'POST' && p === '/api/pair/poll') return send(res, 200, pairing.poll((await readJson(req)).nonce))

    // ---- 本机 Web 后台 ----
    localOnly(req)
    if (p === '/api/info') {
      if (m === 'OPTIONS') { res.writeHead(204, READ_CORS); return res.end() }
      if (m === 'GET') {
        const pr = store.profile
        const st = STYLES[pr.style] ?? STYLES[0]
        return send(res, 200, {
          ok: true, port, version: store.version, device: store.deviceInfo(), pairing: pairing.list(),
          profile: {
            name: pr.name, handle: pr.handle, title: pr.title, status: pr.statuses[pr.status],
            style: st.name, theme: st.name, avatar: pr.avatar, palette: pr.palette,
          },
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
    if (m === 'GET' && p.startsWith('/assets/avatars/')) {
      const name = p.slice('/assets/avatars/'.length)
      if (AVATAR_FILES.has(name)) return file(res, join(HERE, '..', 'assets', 'avatars', name), 'image/png')
      throw new HttpError(404, 'not found')
    }
    if (m === 'GET' && p === '/api/photo.png') {
      const png = store.getPhotoPng()
      if (!png) throw new HttpError(404, 'no photo')
      return sendBuf(res, png, 'image/png', 'no-store')
    }

    if (m === 'GET' && p === '/api/meta') {
      return send(res, 200, {
        styles: STYLES,
        subScenes: SUB_SCENES,
        moods: MOODS,
        qrChannels: QR_CHANNELS,
        builtinAvatars: BUILTIN_AVATARS,
        pixelSprites: PIXEL_SPRITES,
        mbtiOptions: MBTI_OPTIONS,
        themes: THEMES,
        statusColors: STATUS_COLORS,
        presets: PRESETS,
        limits: LIMITS,
      })
    }
    if (m === 'GET' && p === '/api/profile') return send(res, 200, snapshot(store, pairing))
    if (m === 'GET' && p === '/api/power') return send(res, 200, store.powerReport())

    if (m === 'PUT' && p === '/api/profile') {
      const o = req.headers.origin
      if (o && !originOk(o)) throw new HttpError(403, 'origin not allowed')
      const body = await readJson(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '资料格式不对')
      store.update(body)
      nudgeDevice()
      return send(res, 200, snapshot(store, pairing))
    }

    if (m === 'POST' && p === '/api/photo/cutout') {
      const o = req.headers.origin
      if (o && !originOk(o)) throw new HttpError(403, 'origin not allowed')
      const body = await readJson(req, 12 * 1024 * 1024)
      const buf = parseDataUrlOrBase64(body.image)
      const { png, rgb565a8 } = await cutoutPortrait(buf, { cacheDir: store.dir })
      store.savePhoto({ png, rgb565a8 })
      nudgeDevice()
      return send(res, 200, snapshot(store, pairing))
    }

    if (m === 'POST' && p === '/api/qr/decode') {
      const o = req.headers.origin
      if (o && !originOk(o)) throw new HttpError(403, 'origin not allowed')
      const body = await readJson(req, 8 * 1024 * 1024)
      const buf = parseDataUrlOrBase64(body.image)
      const rawUrl = await decodeQrFromImage(buf, { cacheDir: store.dir })
      if (Buffer.byteLength(rawUrl, 'utf8') > LIMITS.qrUrlMax) {
        throw new HttpError(400, `二维码内容过长（${Buffer.byteLength(rawUrl, 'utf8')} 字节），请使用微信/企微名片短链（≤${LIMITS.qrUrlMax} 字节）`)
      }
      const clean = sanitizeUrl(rawUrl)
      if (!clean) throw new HttpError(400, '提取到的二维码内容包含非标准链接字符')
      return send(res, 200, { ok: true, url: clean })
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
    server.once('error', reject)
    server.listen(port, host, () => resolve(server))
  })
}
