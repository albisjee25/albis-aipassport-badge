// 工牌资料：字段规则和发给设备的数据。纯函数，方便测试。
// 设备上每个字段的存储空间是固定的（按 UTF-8 字节算，见固件 main/cb_model.h），
// 这里按同样的上限截断，保证电脑上看到的和设备上显示的一致。
import { DEFAULT_AVATAR, DEFAULT_PALETTE } from './avatars.js'
import { THEMES } from './themes.js'

export const LIMITS = {
  name: 27, handle: 19, title: 39, dept: 39, emp_id: 15, tagline: 63, mbti: 7, sign: 15,
  status: 12,       // 第一页底部的大字，最多 4 个汉字
  answer: 36,       // 自己加的答案，最多 12 个汉字
  memo: 60,         // 便签，最多 20 个汉字
  statuses: 6, answers: 8, memos: 4,
}

export const DEFAULT_PROFILE = {
  name: '新同学', handle: 'NEWBIE', title: '', dept: '', emp_id: '',
  tagline: '', mbti: '', sign: '',
  statuses: ['在线', '专注勿扰', '开会中', '摸鱼中', '来聊天', '下班了'],
  status: 0, theme: 0,
  avatar: DEFAULT_AVATAR, palette: DEFAULT_PALETTE,
  answers: [],
  memos: [],
}

const bytes = (s) => Buffer.byteLength(s, 'utf8')

/** 按 UTF-8 字节数截断，不会把一个字切成两半。 */
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

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

const isColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)

/** 头像可以是 256 位十六进制字符串，也可以是 16 行（每行 16 位，. 表示透明）。不合法返回 null。 */
export function parseAvatar(value) {
  const s = (Array.isArray(value) ? value.join('') : String(value ?? '')).replace(/\s/g, '').replace(/\./g, '0').toLowerCase()
  return /^[0-9a-f]{256}$/.test(s) ? s : null
}

/** 便签可以是文字，也可以是 { text, done }。 */
function memoList(value) {
  const out = []
  for (const m of Array.isArray(value) ? value : []) {
    const text = cutBytes(typeof m === 'string' ? m : m?.text, LIMITS.memo)
    if (text) out.push({ text, done: typeof m === 'object' && Boolean(m?.done) })
    if (out.length >= LIMITS.memos) break
  }
  return out
}

/** 把任意输入整理成合法的资料：缺的字段用 base 补，超长的截断，范围不对的收回来。 */
export function normalize(input = {}, base = DEFAULT_PROFILE) {
  const src = { ...base, ...(input && typeof input === 'object' && !Array.isArray(input) ? input : {}) }
  const text = (k) => cutBytes(src[k], LIMITS[k])
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,，、\n]/) : [])
  const out = {
    name: text('name') || base.name || DEFAULT_PROFILE.name,
    handle: text('handle'), title: text('title'), dept: text('dept'),
    emp_id: cutBytes(String(src.emp_id ?? '').replace(/[^\x20-\x7e]/g, ''), LIMITS.emp_id),
    tagline: text('tagline'),
    mbti: cutBytes(String(src.mbti ?? '').toUpperCase().replace(/[^A-Z-]/g, ''), LIMITS.mbti),
    sign: text('sign'),
  }
  out.statuses = list(src.statuses).map((t) => cutBytes(String(t).replace(/\s/g, ''), LIMITS.status)).filter(Boolean).slice(0, LIMITS.statuses)
  if (!out.statuses.length) out.statuses = ['在线']
  out.status = clampInt(src.status, 0, out.statuses.length - 1, 0)
  out.theme = clampInt(src.theme, 0, THEMES.length - 1, 0)
  out.avatar = parseAvatar(src.avatar) ?? parseAvatar(base.avatar) ?? DEFAULT_AVATAR
  const pal = Array.isArray(src.palette) ? src.palette : []
  out.palette = DEFAULT_PALETTE.map((d, i) => (isColor(pal[i]) ? pal[i].toUpperCase() : (isColor(base.palette?.[i]) ? base.palette[i] : d)))
  out.answers = list(src.answers).map((t) => cutBytes(t, LIMITS.answer)).filter(Boolean).slice(0, LIMITS.answers)
  out.memos = memoList(src.memos)
  return out
}

/** 改便签时保留没改动的那几条的“已完成”：文字一样的沿用旧的勾。 */
export function keepDone(next, prev) {
  const done = new Map((prev ?? []).map((m) => [m.text, m.done]))
  return memoList(next).map((m) => ({ text: m.text, done: m.done || done.get(m.text) === true }))
}

/** 设备用一个数字表示哪几条便签划掉了：第 i 位是 1 表示第 i 条已完成。 */
export const memoMask = (memos) => memos.reduce((mask, m, i) => mask | (m.done ? 1 << i : 0), 0)

/** 发给设备的资料（字段名和固件 cb_net.c 的解析一致）。 */
export function devicePayload(p) {
  return {
    name: p.name, handle: p.handle, title: p.title, dept: p.dept, emp_id: p.emp_id,
    tagline: p.tagline, mbti: p.mbti, sign: p.sign,
    statuses: p.statuses, status: p.status, theme: p.theme,
    avatar: p.avatar, palette: p.palette,
    cards: p.answers,
    memos: p.memos.map((m) => m.text), memo_done: memoMask(p.memos),
  }
}
