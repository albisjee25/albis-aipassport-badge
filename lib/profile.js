// V1.0 (v2.5) 工牌资料：严格按 UI 显示列宽与字节双边界截断（与固件 main/cb_model.h 1:1 一致）。
import { DEFAULT_AVATAR, DEFAULT_PALETTE } from './avatars.js'
import { BUILTIN_AVATARS, MBTI_OPTIONS, MOODS, PIXEL_SPRITES, QR_CHANNELS, STYLES, SUB_SCENES } from './themes.js'

export const LIMITS = {
  // 显示列宽上限（1 个汉字/全角 = 2 列，1 个半角英文/数字 = 1 列；PRD v2.5 4.1.3）
  nameCols: 8,        // 姓名最多 4 个汉字（或 8 个英文）
  handleCols: 10,     // 花名 3–10 个 ASCII 字符（不含 @）
  empIdCols: 6,       // 工号最多 6 个 ASCII 字符
  titleCols: 12,      // 身份 / 职务最多 6 个汉字
  taglineCols: 18,    // 宣言最多 9 个汉字
  statusCols: 8,      // 状态字最多 4 个汉字
  passTagCols: 12,    // 通行证顶标最多 12 个大写 ASCII
  qrLabelCols: 18,    // 名片说明最多 9 个汉字（完整容纳 企微扫码 · 联系我 / 微信扫码 · 加好友）
  qrUrlMax: 80,       // 短链 URL 上限 80 ASCII 字节（适配 QR V2–V4 ECC-M）
  memoCols: 40,       // 便签每条最多 20 个汉字（2 行 @ 14px）
  answerCols: 24,     // 答案之书每条最多 12 个汉字
  // 字节硬上限（与固件结构体缓冲对齐）
  name: 27, handle: 15, title: 35, emp_id: 11, tagline: 55, mbti: 4, pass_tag: 15,
  status: 15, answer: 39, memo: 71, qrLabel: 31,
  // 数量上限
  statuses: 6, qrs: 3, memos: 10, memoStars: 3, answers: 8,
}

export const defaultSubScene = (style) => (style === 1 || style === 2 ? 1 : 0)

export const DEFAULT_PROFILE = {
  name: '刘杰',
  handle: 'albis',
  title: '产品经理',
  emp_id: '6966',
  tagline: '把一件事做到极致',
  mbti: 'INTJ',
  pass_tag: 'CREATOR PASS',
  statuses: ['在线', '来聊天', '摸鱼中', '开会中', '专注勿扰', '下班了'],
  status: 0,
  mood_idx: 0,
  style: 0,
  palette_idx: 0,
  sub_scene: 0,        // 0=职场简约 1=手账潮玩
  avatar_mode: 0,      // 0=默认形象 1=自定义像素画 2=自定义上传抠图
  avatar_preset: 4,    // 摸鱼冰美式少女
  pixel_preset: 0,     // 潮帽少年
  photo_ver: 0,
  avatar: DEFAULT_AVATAR,
  palette: DEFAULT_PALETTE,
  qrs: [],
  qr_idx: 0,
  qr_rounded: true,
  memos: [],
  answers: [],
}

const VALID_MBTI = new Set(MBTI_OPTIONS)
const bytes = (s) => Buffer.byteLength(s, 'utf8')

export function charCols(ch) {
  const cp = ch.codePointAt(0) ?? 0
  if (
    cp >= 0x1100 && (
      cp <= 0x115F ||
      (cp >= 0x2E80 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE10 && cp <= 0xFE6F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      cp >= 0x1F300
    )
  ) return 2
  return 1
}

export function displayCols(str) {
  let c = 0
  for (const ch of String(str ?? '')) c += charCols(ch)
  return c
}

export function cutBytes(value, max) {
  let out = ''
  let used = 0
  for (const ch of String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()) {
    const n = bytes(ch)
    if (used + n > max) break
    out += ch
    used += n
  }
  return out.trim()
}

export function cutCols(value, maxCols, maxBytes = maxCols * 3) {
  let out = ''
  let cols = 0
  let used = 0
  const cleaned = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  for (const ch of cleaned) {
    const w = charCols(ch)
    const n = bytes(ch)
    if (cols + w > maxCols || used + n > maxBytes) break
    out += ch
    cols += w
    used += n
  }
  return out.trim()
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

const isColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)

export function sanitizeHandle(v) {
  const s = String(v ?? '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, LIMITS.handleCols)
  return s || 'passport'
}

export function sanitizeEmpId(v) {
  return String(v ?? '').trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, LIMITS.empIdCols)
}

export function sanitizePassTag(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9 /]/g, '').slice(0, LIMITS.passTagCols).trim()
  return s || 'OPEN PASS'
}

export function sanitizeMbti(v) {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  return s.length === 4 && VALID_MBTI.has(s) ? s : ''
}

export function sanitizeUrl(v) {
  const s = String(v ?? '').trim().replace(/[^\x21-\x7e]/g, '')
  return s.slice(0, LIMITS.qrUrlMax)
}

export function parseAvatar(value) {
  const s = (Array.isArray(value) ? value.join('') : String(value ?? '')).replace(/\s/g, '').replace(/\./g, '0').toLowerCase()
  return /^[0-9a-f]{256}$/.test(s) ? s : null
}

function memoList(value) {
  const out = []
  let stars = 0
  for (const m of Array.isArray(value) ? value : []) {
    const text = cutCols(typeof m === 'string' ? m : m?.text, LIMITS.memoCols, LIMITS.memo)
    if (text) {
      let star = typeof m === 'object' && Boolean(m?.star)
      if (star) {
        if (stars >= LIMITS.memoStars) star = false
        else stars += 1
      }
      out.push({
        text,
        done: typeof m === 'object' && Boolean(m?.done),
        star,
      })
    }
    if (out.length >= LIMITS.memos) break
  }
  return out
}

function inferChannel(q) {
  if (Number.isInteger(q.channel) && q.channel >= 0 && q.channel < QR_CHANNELS.length) return q.channel
  const url = String(q.url || '').toLowerCase()
  const lbl = String(q.label || '')
  if (url.includes('work.weixin') || lbl.includes('企')) return 0
  if (url.includes('wechat.com') || lbl.includes('微')) return 1
  if (url.includes('xhs') || url.includes('xiaohongshu') || lbl.includes('小红书')) return 2
  if (lbl.includes('作品')) return 4
  if (lbl.includes('主页')) return 3
  return 5
}

function qrList(value) {
  const out = []
  for (const q of Array.isArray(value) ? value : []) {
    if (!q || typeof q !== 'object') continue
    const url = sanitizeUrl(q.url)
    if (!url) continue
    const channel = inferChannel(q)
    const ch = QR_CHANNELS[channel] ?? QR_CHANNELS[5]
    const rawLbl = cutCols(q.label, LIMITS.qrLabelCols, LIMITS.qrLabel)
    const label = (!rawLbl || rawLbl.includes('扫码')) ? ch.caption : rawLbl
    out.push({ label, url, channel })
    if (out.length >= LIMITS.qrs) break
  }
  return out
}

export function normalize(input = {}, base = DEFAULT_PROFILE) {
  const src = { ...base, ...(input && typeof input === 'object' && !Array.isArray(input) ? input : {}) }
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,，、\n]/) : [])

  const out = {
    name: cutCols(src.name, LIMITS.nameCols, LIMITS.name) || base.name || DEFAULT_PROFILE.name,
    handle: sanitizeHandle(src.handle),
    title: cutCols(src.title, LIMITS.titleCols, LIMITS.title),
    emp_id: sanitizeEmpId(src.emp_id),
    tagline: cutCols(src.tagline, LIMITS.taglineCols, LIMITS.tagline),
    mbti: sanitizeMbti(src.mbti),
    pass_tag: sanitizePassTag(src.pass_tag ?? DEFAULT_PROFILE.pass_tag),
  }

  out.statuses = list(src.statuses)
    .map((t) => cutCols(String(t).replace(/\s/g, ''), LIMITS.statusCols, LIMITS.status))
    .filter(Boolean)
    .slice(0, LIMITS.statuses)
  if (!out.statuses.length) out.statuses = ['在线']
  out.status = clampInt(src.status, 0, out.statuses.length - 1, 0)
  out.mood_idx = clampInt(src.mood_idx, 0, MOODS.length - 1, 0)

  out.style = clampInt(src.style, 0, STYLES.length - 1, 0)
  out.palette_idx = clampInt(src.palette_idx, 0, STYLES[out.style].palettes.length - 1, 0)
  out.sub_scene = clampInt(src.sub_scene, 0, SUB_SCENES.length - 1, defaultSubScene(out.style))

  out.avatar_mode = clampInt(src.avatar_mode, 0, 2, 0)
  out.avatar_preset = clampInt(src.avatar_preset, 0, BUILTIN_AVATARS.length - 1, 0)
  out.pixel_preset = clampInt(src.pixel_preset, 0, PIXEL_SPRITES.length - 1, 0)
  out.photo_ver = Math.max(0, Math.floor(Number(src.photo_ver) || 0))
  out.avatar = parseAvatar(src.avatar) ?? parseAvatar(base.avatar) ?? DEFAULT_AVATAR
  const pal = Array.isArray(src.palette) ? src.palette : []
  out.palette = DEFAULT_PALETTE.map((d, i) => (isColor(pal[i]) ? pal[i].toUpperCase() : (isColor(base.palette?.[i]) ? base.palette[i] : d)))

  out.qrs = qrList(src.qrs)
  out.qr_idx = out.qrs.length ? clampInt(src.qr_idx, 0, out.qrs.length - 1, 0) : 0
  out.qr_rounded = src.qr_rounded === undefined ? true : Boolean(src.qr_rounded)

  out.memos = memoList(src.memos)

  out.answers = list(src.answers)
    .map((t) => cutCols(t, LIMITS.answerCols, LIMITS.answer))
    .filter(Boolean)
    .slice(0, LIMITS.answers)

  return out
}

export function keepDone(next, prev) {
  const prevMap = new Map((prev ?? []).map((m) => [m.text, m]))
  return memoList(
    (Array.isArray(next) ? next : []).map((m) => {
      const text = typeof m === 'string' ? m : m?.text
      const old = prevMap.get(cutCols(text, LIMITS.memoCols, LIMITS.memo))
      return {
        text,
        done: (typeof m === 'object' && Boolean(m?.done)) || old?.done === true,
        star: (typeof m === 'object' && Boolean(m?.star)) || old?.star === true,
      }
    }),
  )
}

export const memoMask = (memos) => memos.reduce((mask, m, i) => mask | (m.done ? 1 << i : 0), 0)
export const memoStarMask = (memos) => memos.reduce((mask, m, i) => mask | (m.star ? 1 << i : 0), 0)

/** 发给固件 cb_net.c 的精简 JSON 载荷（与 cb_net.c parse_profile 1:1 对齐）。 */
export function devicePayload(p) {
  return {
    name: p.name,
    handle: p.handle,
    title: p.title,
    emp_id: p.emp_id,
    tagline: p.tagline,
    mbti: p.mbti,
    pass_tag: p.pass_tag,
    statuses: p.statuses,
    status: p.status,
    mood_idx: p.mood_idx,
    style: p.style,
    palette_idx: p.palette_idx,
    sub_scene: p.sub_scene,
    avatar_mode: p.avatar_mode,
    avatar_preset: p.avatar_preset,
    pixel_preset: p.pixel_preset,
    photo_ver: p.photo_ver,
    avatar: p.avatar,
    palette: p.palette,
    qrs: p.qrs.map((q) => ({ label: q.label, url: q.url, channel: q.channel })),
    qr_idx: p.qr_idx,
    qr_rounded: p.qr_rounded ? 1 : 0,
    cards: p.answers,
    memos: p.memos.map((m) => m.text),
    memo_done: memoMask(p.memos),
    memo_star: memoStarMask(p.memos),
  }
}
